# Captcha Bot + Telegram Mini App

Telegram-бот с Mini App на домене `https://dktk.fun`.

Пользователь открывает Mini App, проходит капчу (перетаскивание кандибобера) и получает билет прямо в приложении — достаточно сделать скриншот.

## Функционал

- `/start` — кнопка открытия Mini App
- `/post_template` — текст и ссылка для поста в канале
- Mini App из 2 экранов:
  - капча с drag-and-drop
  - билет на экране
- Логотип по центру в верхней части экрана
- Серверная проверка `initData` Telegram WebApp
- Rate limit на попытки прохождения капчи

## Стек

- Python 3.12+
- [aiogram](https://docs.aiogram.dev/) — Telegram Bot API
- [aiohttp](https://docs.aiohttp.org/) — веб-сервер и API

## Структура проекта

```
Captcha_Bot/
├── main.py
├── prepare_captcha_config.py
├── requirements.txt
├── .env
├── media/
│   ├── Logo.PNG
│   ├── base.png
│   ├── hat.png
│   ├── Ticket.PNG
│   └── captcha_config.json
└── web/static/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Установка

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Создайте файл `.env`:

```env
BOT_TOKEN=your_telegram_bot_token
```

## Запуск

```bash
source .venv/bin/activate
python main.py
```

Приложение слушает `0.0.0.0:8080` и одновременно запускает aiogram polling и aiohttp веб-сервер.

## Production (dktk.fun)

### Маршруты

| Маршрут | Описание |
|---------|----------|
| `GET /miniapp` | Mini App |
| `GET /api/captcha/config` | Конфиг капчи |
| `POST /api/captcha/verify` | Проверка капчи |
| `GET /static/app/*` | CSS/JS |
| `GET /static/media/*` | Изображения |

### Настройка Telegram

1. Создайте бота через [@BotFather](https://t.me/BotFather).
2. Укажите Web App URL: `https://dktk.fun/miniapp`.
3. Для прямого входа в Mini App используйте ссылку:

```
https://t.me/<bot_username>?startapp=from_channel
```

### Пост в канале

В личке с ботом выполните:

```
/post_template
```

## Капча

Координаты слота задаются в `media/captcha_config.json`. После замены `base.png` / `hat.png` пересоберите конфиг:

```bash
python prepare_captcha_config.py
```

Лимит попыток: 8 за 5 минут на пользователя.

## API

### `POST /api/captcha/verify`

Тело запроса:

```json
{
  "initData": "<telegram_webapp_init_data>",
  "hatX": 586,
  "hatY": 0
}
```

Ответ при успехе:

```json
{ "ok": true }
```

Возможные `reason` при ошибке: `invalid_init_data`, `invalid_user`, `invalid_coordinates`, `wrong_position`, `rate_limited`.
