# Captcha Bot + Telegram Mini App

Простой Telegram-бот с Mini App на домене `https://dktk.fun`.

Пользователь переходит из поста в канале в бота, открывает Mini App, проходит капчу (перетаскивание красной шапки) и получает билет с возможностью скачать его.

## Функционал

- `/start` — кнопка открытия Mini App (`https://dktk.fun/miniapp`)
- Mini App из 2 экранов:
  - капча с drag-and-drop шапкой
  - билет + кнопка скачивания
- Логотип в правом верхнем углу на обоих экранах
- Серверная проверка `initData` Telegram WebApp
- Rate limit на попытки прохождения капчи

## Стек

- Python 3.12+
- [aiogram](https://docs.aiogram.dev/) — Telegram Bot API
- [aiohttp](https://docs.aiohttp.org/) — веб-сервер и API

## Структура проекта

```
Captcha_Bot/
├── main.py                 # бот + веб-сервер в одном процессе
├── requirements.txt
├── .env                    # BOT_TOKEN (не коммитить)
├── media/
│   ├── Logo.PNG
│   ├── Mem_Captcha.PNG
│   └── Ticket.PNG
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

Создайте файл `.env` в корне проекта:

```env
BOT_TOKEN=your_telegram_bot_token
```

## Запуск

```bash
source .venv/bin/activate
python main.py
```

Приложение слушает `0.0.0.0:8080` и одновременно:

- запускает aiogram polling
- поднимает aiohttp веб-сервер

## Production (dktk.fun)

Домен зафиксирован в коде: `https://dktk.fun`.

### Маршруты

| Маршрут | Описание |
|---------|----------|
| `GET /miniapp` | Mini App |
| `POST /api/captcha/verify` | Проверка капчи |
| `GET /download/ticket` | Скачивание билета |
| `GET /static/app/*` | CSS/JS |
| `GET /static/media/*` | Изображения |

### Reverse proxy (Nginx)

Пример проксирования на локальный порт `8080`:

```nginx
server {
    listen 443 ssl;
    server_name dktk.fun;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### systemd (пример)

```ini
[Unit]
Description=Captcha Bot
After=network.target

[Service]
User=www-data
WorkingDirectory=/path/to/Captcha_Bot
EnvironmentFile=/path/to/Captcha_Bot/.env
ExecStart=/path/to/Captcha_Bot/.venv/bin/python main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

## Настройка Telegram

1. Создайте бота через [@BotFather](https://t.me/BotFather).
2. В BotFather укажите Web App URL: `https://dktk.fun/miniapp`.
3. Запустите бота на сервере.

### Пост в канале

В личке с ботом выполните:

```
/post_template
```

Бот вернёт текст для поста и deep-link вида:

```
https://t.me/<bot_username>?start=from_channel
```

В посте канала добавьте кнопку-ссылку на этого бота.

## Капча

Целевая позиция шапки задаётся в `main.py`:

```python
CAPTCHA_TARGET_X = 250
CAPTCHA_TARGET_Y = 170
CAPTCHA_TOLERANCE = 20
```

При необходимости подстройте координаты под изображение `Mem_Captcha.PNG`.

Лимит попыток: 8 за 5 минут на пользователя.

## API

### `POST /api/captcha/verify`

Тело запроса:

```json
{
  "initData": "<telegram_webapp_init_data>",
  "hatX": 250,
  "hatY": 170
}
```

Ответ при успехе:

```json
{ "ok": true }
```

Ответ при ошибке:

```json
{ "ok": false, "reason": "wrong_position" }
```

Возможные `reason`: `invalid_init_data`, `invalid_user`, `invalid_coordinates`, `wrong_position`, `rate_limited`.
