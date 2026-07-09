import asyncio
import hashlib
import hmac
import json
import logging
import os
import signal
import time
from pathlib import Path
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart, Command
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

BASE_DIR = Path(__file__).resolve().parent
WEB_STATIC_DIR = BASE_DIR / "web" / "static"
MEDIA_DIR = BASE_DIR / "media"
DOTENV_PATH = BASE_DIR / ".env"

APP_HOST = "0.0.0.0"
APP_PORT = 8080
APP_DOMAIN = "https://dktk.fun"
MINI_APP_URL = f"{APP_DOMAIN}/miniapp"

CAPTCHA_CONFIG_PATH = MEDIA_DIR / "captcha_config.json"
MAX_ATTEMPTS = 8
ATTEMPT_WINDOW_SECONDS = 300
TICKET_VALID_SECONDS = 3600

ATTEMPTS_BY_USER: dict[int, list[float]] = {}
PASSED_USERS: dict[int, float] = {}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    result: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


ENV_VALUES = load_env_file(DOTENV_PATH)
BOT_TOKEN = os.getenv("BOT_TOKEN", ENV_VALUES.get("BOT_TOKEN", ""))

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set. Add BOT_TOKEN to .env file.")


def load_captcha_config() -> dict:
    if not CAPTCHA_CONFIG_PATH.exists():
        raise RuntimeError(f"Captcha config not found: {CAPTCHA_CONFIG_PATH}")
    return json.loads(CAPTCHA_CONFIG_PATH.read_text(encoding="utf-8"))


def get_captcha_config() -> dict:
    return load_captcha_config()


def validate_telegram_webapp_init_data(init_data: str, bot_token: str) -> bool:
    if not init_data:
        return False
    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return False

    data_check_string = "\n".join(f"{key}={parsed[key]}" for key in sorted(parsed))
    secret_key = hmac.new(
        key=b"WebAppData", msg=bot_token.encode("utf-8"), digestmod=hashlib.sha256
    ).digest()
    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(calculated_hash, received_hash)


def parse_user_id_from_init_data(init_data: str) -> int | None:
    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    user_raw = parsed.get("user")
    if not user_raw:
        return None
    try:
        user_data = json.loads(user_raw)
        user_id = user_data.get("id")
        if isinstance(user_id, int):
            return user_id
    except json.JSONDecodeError:
        return None
    return None


def check_attempt_limit(user_id: int) -> bool:
    now = time.time()
    attempts = ATTEMPTS_BY_USER.get(user_id, [])
    fresh_attempts = [ts for ts in attempts if now - ts < ATTEMPT_WINDOW_SECONDS]
    ATTEMPTS_BY_USER[user_id] = fresh_attempts
    return len(fresh_attempts) < MAX_ATTEMPTS


def register_attempt(user_id: int) -> None:
    ATTEMPTS_BY_USER.setdefault(user_id, []).append(time.time())


def mark_captcha_passed(user_id: int) -> None:
    PASSED_USERS[user_id] = time.time()


def user_passed_captcha(user_id: int) -> bool:
    passed_at = PASSED_USERS.get(user_id)
    if passed_at is None:
        return False
    return time.time() - passed_at < TICKET_VALID_SECONDS


async def start_handler(message: Message) -> None:
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎫 Открыть Mini App",
                    web_app=WebAppInfo(url=MINI_APP_URL),
                )
            ]
        ]
    )
    await message.answer(
        "<b>🎟 Добро пожаловать!</b>\n\n"
        "Пройдите короткую капчу в Mini App и получите билет.\n"
        "Нажмите кнопку ниже, чтобы начать 👇",
        reply_markup=keyboard,
        parse_mode="HTML",
    )


async def post_template_handler(message: Message) -> None:
    bot_username = (await message.bot.get_me()).username
    text = (
        "<b>🎫 Заберите свой билет</b>\n\n"
        "1. Перейдите в бота\n"
        "2. Откройте Mini App\n"
        "3. Соберите картинку в капче\n"
        "4. Получите билет в чате\n\n"
        f"👉 <a href=\"https://t.me/{bot_username}?start=from_channel\">Открыть бота</a>"
    )
    await message.answer(text, parse_mode="HTML", disable_web_page_preview=True)


async def miniapp_page(_: web.Request) -> web.FileResponse:
    return web.FileResponse(WEB_STATIC_DIR / "index.html")


async def captcha_config(_: web.Request) -> web.Response:
    return web.json_response(get_captcha_config())


async def download_ticket(_: web.Request) -> web.FileResponse:
    ticket_path = MEDIA_DIR / "Ticket.PNG"
    response = web.FileResponse(ticket_path)
    response.headers["Content-Disposition"] = 'attachment; filename="Ticket.PNG"'
    return response


async def verify_captcha(request: web.Request) -> web.Response:
    payload = await request.json()
    init_data = str(payload.get("initData", ""))
    hat_x = payload.get("hatX")
    hat_y = payload.get("hatY")

    if not validate_telegram_webapp_init_data(init_data, BOT_TOKEN):
        return web.json_response({"ok": False, "reason": "invalid_init_data"}, status=403)

    user_id = parse_user_id_from_init_data(init_data)
    if user_id is None:
        return web.json_response({"ok": False, "reason": "invalid_user"}, status=400)

    if not check_attempt_limit(user_id):
        return web.json_response({"ok": False, "reason": "rate_limited"}, status=429)

    if not isinstance(hat_x, (int, float)) or not isinstance(hat_y, (int, float)):
        register_attempt(user_id)
        return web.json_response({"ok": False, "reason": "invalid_coordinates"}, status=400)

    config = get_captcha_config()
    slot = config["hatSlot"]
    tolerance = int(config.get("tolerance", 42))
    delta_x = abs(float(hat_x) - slot["x"])
    delta_y = abs(float(hat_y) - slot["y"])
    is_valid = delta_x <= tolerance and delta_y <= tolerance

    register_attempt(user_id)
    if not is_valid:
        return web.json_response({"ok": False, "reason": "wrong_position"})

    mark_captcha_passed(user_id)
    return web.json_response({"ok": True})


async def send_ticket(request: web.Request) -> web.Response:
    payload = await request.json()
    init_data = str(payload.get("initData", ""))

    if not validate_telegram_webapp_init_data(init_data, BOT_TOKEN):
        return web.json_response({"ok": False, "reason": "invalid_init_data"}, status=403)

    user_id = parse_user_id_from_init_data(init_data)
    if user_id is None:
        return web.json_response({"ok": False, "reason": "invalid_user"}, status=400)

    if not user_passed_captcha(user_id):
        return web.json_response({"ok": False, "reason": "captcha_required"}, status=403)

    ticket_path = MEDIA_DIR / "Ticket.PNG"
    bot: Bot = request.app["bot"]
    ticket_photo = FSInputFile(ticket_path)
    ticket_document = FSInputFile(ticket_path)

    await bot.send_photo(
        chat_id=user_id,
        photo=ticket_photo,
        caption="🎫 Ваш билет",
    )
    await bot.send_document(
        chat_id=user_id,
        document=ticket_document,
        caption="📎 Билет файлом",
    )

    return web.json_response({"ok": True})


def create_web_app(bot: Bot) -> web.Application:
    app = web.Application()
    app["bot"] = bot
    app.add_routes(
        [
            web.get("/miniapp", miniapp_page),
            web.get("/api/captcha/config", captcha_config),
            web.post("/api/captcha/verify", verify_captcha),
            web.post("/api/ticket/send", send_ticket),
            web.get("/download/ticket", download_ticket),
        ]
    )
    app.router.add_static("/static/app/", path=WEB_STATIC_DIR, name="app_static")
    app.router.add_static("/static/media/", path=MEDIA_DIR, name="media_static")
    return app


async def main() -> None:
    stop_event = asyncio.Event()

    def request_stop() -> None:
        if not stop_event.is_set():
            logger.info("Получен сигнал остановки...")
            stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, request_stop)

    bot = Bot(BOT_TOKEN)
    app = create_web_app(bot)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host=APP_HOST, port=APP_PORT)
    await site.start()
    logger.info("Веб-сервер запущен: http://%s:%s", APP_HOST, APP_PORT)
    logger.info("Mini App: %s", MINI_APP_URL)

    dp = Dispatcher()
    dp.message.register(start_handler, CommandStart())
    dp.message.register(post_template_handler, Command("post_template"), F.chat.type == "private")

    polling_task = asyncio.create_task(dp.start_polling(bot, handle_signals=False))
    me = await bot.get_me()
    logger.info("Бот запущен: @%s", me.username)

    await stop_event.wait()

    logger.info("Останавливаем сервисы...")
    polling_task.cancel()
    try:
        await polling_task
    except asyncio.CancelledError:
        pass

    await runner.cleanup()
    await bot.session.close()
    logger.info("Остановка завершена")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
