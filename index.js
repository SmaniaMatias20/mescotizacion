const axios = require('axios');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

axios.defaults.timeout = 10000;

const IG_USER_ID = process.env.IG_USER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const TEMPLATE_URL = process.env.TEMPLATE_URL;
const OUTPUT_IMAGE = process.env.OUTPUT_IMAGE;

const CLOUD_NAME = process.env.CLOUD_NAME;
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET
});

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ============================
   OBTENER REAL CON RETRY
============================ */

async function obtenerReal() {

    try {

        const res = await axios.get(
            "https://open.er-api.com/v6/latest/BRL"
        );

        console.log(res.data);

        if (!res.data || !res.data.rates || !res.data.rates.ARS) {
            throw new Error("No se pudo obtener BRL/ARS");
        }

        const ars = res.data.rates.ARS;

        return {
            buy: (ars * 0.995).toFixed(2),
            sell: (ars * 1.005).toFixed(2)
        };

    } catch (err) {

        if (err.response && err.response.status === 429) {

            console.log("⚠️ Límite de API REAL alcanzado. Esperando 60s...");

            await delay(60000);

            return await obtenerReal();

        }

        console.log("⚠️ No se pudo obtener REAL, usando 0");

        return {
            buy: "0",
            sell: "0"
        };
    }
}

/* ============================
   GENERAR IMAGEN
============================ */

async function generarImagenDolar(cotizaciones) {

    const image = await loadImage(TEMPLATE_URL);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, 0, 0, image.width, image.height);

    const margin = 60;
    const startX = margin;
    let y = margin + 20;

    const fontTitle = 'bold 40px Arial';
    const fontCurrency = 'bold 28px Arial';
    const fontValues = '24px Arial';

    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;

    ctx.font = fontTitle;
    ctx.fillStyle = '#ffffff';
    ctx.fillText("COTIZACIONES", startX, y);

    y += 60;

    const monedas = [
        { nombre: "DÓLAR OFICIAL", buy: cotizaciones.oficial_buy, sell: cotizaciones.oficial_sell },
        { nombre: "DÓLAR BLUE", buy: cotizaciones.blue_buy, sell: cotizaciones.blue_sell },
        { nombre: "EURO OFICIAL", buy: cotizaciones.euro_oficial_buy, sell: cotizaciones.euro_oficial_sell },
        { nombre: "EURO BLUE", buy: cotizaciones.euro_blue_buy, sell: cotizaciones.euro_blue_sell },
        { nombre: "REAL", buy: cotizaciones.real_buy, sell: cotizaciones.real_sell }
    ];

    monedas.forEach((moneda) => {

        ctx.font = fontCurrency;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(moneda.nombre, startX, y);

        y += 30;

        ctx.font = fontValues;
        ctx.fillStyle = "#d1d5db";

        ctx.fillText(`Compra  $${moneda.buy}`, startX, y);
        y += 26;

        ctx.fillText(`Venta   $${moneda.sell}`, startX, y);

        y += 18;

        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.moveTo(startX, y);
        ctx.lineTo(startX + 320, y);
        ctx.stroke();

        y += 34;
    });

    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(OUTPUT_IMAGE, buffer);

    console.log("✅ Imagen generada:", OUTPUT_IMAGE);

    return OUTPUT_IMAGE;
}

/* ============================
   PUBLICAR EN INSTAGRAM
============================ */

async function publicarInstagram() {

    try {

        console.log("🚀 Iniciando publicación:", new Date().toLocaleString());

        const res = await axios.get(
            'https://api.bluelytics.com.ar/v2/latest'
        );

        const real = await obtenerReal();

        const dolarBlue = res.data.blue;
        const dolarOficial = res.data.oficial;

        const euroBlue = res.data.blue_euro;
        const euroOficial = res.data.oficial_euro;

        const cotizaciones = {

            blue_buy: dolarBlue.value_buy,
            blue_sell: dolarBlue.value_sell,

            oficial_buy: dolarOficial.value_buy,
            oficial_sell: dolarOficial.value_sell,

            euro_blue_buy: euroBlue.value_buy,
            euro_blue_sell: euroBlue.value_sell,

            euro_oficial_buy: euroOficial.value_buy,
            euro_oficial_sell: euroOficial.value_sell,

            real_buy: real.buy,
            real_sell: real.sell
        };

        console.log('💵 Cotizaciones obtenidas:', cotizaciones);

        const localImage = await generarImagenDolar(cotizaciones);

        const uploadRes = await cloudinary.uploader.upload(localImage, { folder: 'dolar' });

        const IMAGE_URL = uploadRes.secure_url;

        console.log('✅ Imagen subida:', IMAGE_URL);

        const createMediaRes = await axios.post(
            `https://graph.instagram.com/v25.0/${IG_USER_ID}/media`,
            null,
            {
                params: {
                    image_url: IMAGE_URL,
                    caption: `💵 Cotización del día

Dólar Blue: Compra $${cotizaciones.blue_buy} / Venta $${cotizaciones.blue_sell}
Dólar Oficial: Compra $${cotizaciones.oficial_buy} / Venta $${cotizaciones.oficial_sell}

Euro Blue: Compra $${cotizaciones.euro_blue_buy} / Venta $${cotizaciones.euro_blue_sell}
Euro Oficial: Compra $${cotizaciones.euro_oficial_buy} / Venta $${cotizaciones.euro_oficial_sell}

Real: Compra $${cotizaciones.real_buy} / Venta $${cotizaciones.real_sell}

🤖 Bot desarrollado por @mes.virtual

#DolarBlue #EuroBlue #DolarHoy #CotizacionArgentina`,
                    access_token: ACCESS_TOKEN
                }
            }
        );

        const mediaId = createMediaRes.data.id;

        console.log("📦 Media creado:", mediaId);

        let status = 'IN_PROGRESS';

        while (status === 'IN_PROGRESS') {

            await delay(3000);

            const statusRes = await axios.get(
                `https://graph.instagram.com/${mediaId}`,
                {
                    params: {
                        fields: 'status_code',
                        access_token: ACCESS_TOKEN
                    }
                }
            );

            status = statusRes.data.status_code;

            console.log("🔄 Estado:", status);
        }

        if (status !== 'FINISHED') {
            throw new Error("Media no procesado");
        }

        const publishRes = await axios.post(
            `https://graph.instagram.com/v25.0/${IG_USER_ID}/media_publish`,
            null,
            {
                params: {
                    creation_id: mediaId,
                    access_token: ACCESS_TOKEN
                }
            }
        );

        console.log("🎉 Publicado:", publishRes.data);

    } catch (err) {

        if (err.response) {
            console.error("❌ Error API:", err.response.data);
        } else {
            console.error("❌ Error:", err.message);
        }
    }
}

(async () => {

    console.log("🚀 Ejecutando bot:", new Date().toLocaleString());

    await publicarInstagram();

    console.log("✅ Bot finalizado");

    process.exit(0);

})();