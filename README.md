# Kaufland Product Scraper

Автоматизиран скрапер за продукти от Kaufland България, фокусиран върху месни продукти и промоции.

## Функционалности

- Автоматично събиране на данни за месни продукти от Kaufland
- Ежедневно обновяване на данните (00:05 българско време)
- Кеширане на резултатите за 24 часа
- REST API за достъп до данните
- Запазване на историята в JSON файлове

## API Endpoints

- `GET /api/scrape/meat` - Връща всички месни продукти
- `GET /health` - Проверка на статуса на сървъра

## Технически детайли

- Node.js сървър с Express
- Puppeteer за уеб скрапинг
- Автоматично deployment на Render.com

## Изисквания

- Node.js >= 18.0.0
- npm

## Инсталация

## Локално стартиране

1. Инсталирайте зависимостите:
```bash
npm install
```

2. Стартирайте сървъра:
```bash
node server.js
```

## Деплойване в Render.com

1. Създайте акаунт в [Render.com](https://render.com)
2. Свържете вашия GitHub репозитори
3. Създайте нов Web Service
4. Изберете вашия репозитори
5. Изберете "Docker" като Runtime
6. Натиснете "Create Web Service"

Render автоматично ще:
- Прочете render.yaml конфигурацията
- Изгради Docker image
- Стартира контейнера
- Предостави публичен URL

## Бележки
- Приложението ще бъде достъпно на генерирания от Render URL
- Може да настроите environment variables от Render dashboard
- Автоматично деплойване при push към main branch

## Environment Variables

- `PORT` - Порт на сървъра (по подразбиране: 3000)
- `DATA_DIR` - Директория за съхранение на JSON файлове (по подразбиране: 'scrapes')
- `RENDER` - Флаг за Render.com среда

## Deployment

Проектът е конфигуриран за автоматичен deployment на Render.com чрез `render.yaml`. #   f o o d p r i c e  
 