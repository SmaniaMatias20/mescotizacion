const axios = require('axios');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

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

// Función para esperar X milisegundos
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Generar imagen con la cotización encima
async function generarImagenDolar(cotizaciones) {
    // cotizaciones = { blue_buy, blue_sell, oficial_buy, oficial_sell }

    const image = await loadImage(TEMPLATE_URL);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    // Dibujar plantilla
    ctx.drawImage(image, 0, 0, image.width, image.height);

    const padding = 40;

    // Título
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;

    const textTitle = 'Cotización Dólar';
    const titleWidth = ctx.measureText(textTitle).width;
    ctx.fillText(textTitle, image.width - titleWidth - padding, image.height - 180);

    // Configuración de valores (fuente un poco más grande para los números)
    ctx.font = 'bold 36px Arial';

    const lines = [
        `Oficial: Compra $${cotizaciones.oficial_buy} / Venta $${cotizaciones.oficial_sell}`,
        `Blue: Compra $${cotizaciones.blue_buy} / Venta $${cotizaciones.blue_sell}`
    ];

    // Escribir cada línea con un margen vertical
    lines.forEach((line, i) => {
        const lineWidth = ctx.measureText(line).width;
        ctx.fillText(line, image.width - lineWidth - padding, image.height - 120 + i * 50);
    });

    // Guardar imagen
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(OUTPUT_IMAGE, buffer);
    console.log('✅ Imagen generada:', OUTPUT_IMAGE);

    return OUTPUT_IMAGE;
}

// Publicar en Instagram
async function publicarInstagram() {
    try {
        // 1️⃣ Obtener cotización completa
        const res = await axios.get('https://api.bluelytics.com.ar/v2/latest');
        const dolarBlue = res.data.blue;
        const dolarOficial = res.data.oficial;

        const cotizaciones = {
            blue_buy: dolarBlue.value_buy,
            blue_sell: dolarBlue.value_sell,
            oficial_buy: dolarOficial.value_buy,
            oficial_sell: dolarOficial.value_sell
        };

        console.log('💵 Cotizaciones obtenidas:', cotizaciones);

        // 2️⃣ Generar imagen con todas las cotizaciones
        const localImage = await generarImagenDolar(cotizaciones);

        // El resto del código queda igual: subir a Cloudinary, crear media object, delay, publicar...

        // 3️⃣ Subir a Cloudinary
        const uploadRes = await cloudinary.uploader.upload(localImage, { folder: 'dolar' });
        const IMAGE_URL = uploadRes.secure_url;
        console.log('✅ Imagen subida a Cloudinary:', IMAGE_URL);

        // 4️⃣ Crear media object en Instagram
        const createMediaRes = await axios.post(
            `https://graph.instagram.com/v25.0/${IG_USER_ID}/media`,
            null,
            {
                params: {
                    image_url: IMAGE_URL,
                    caption: `💵 Cotización del día:
                    Dólar Blue: Compra $${cotizaciones.blue_buy} / Venta $${cotizaciones.blue_sell}
                    Dólar Oficial: Compra $${cotizaciones.oficial_buy} / Venta $${cotizaciones.oficial_sell}
                    #DolarBlue #DolarOficial #CotizacionDiaria #Argentina`,
                    access_token: ACCESS_TOKEN
                }
            }
        );

        const mediaId = createMediaRes.data.id;
        console.log('✅ Media creado con ID:', mediaId);

        // 5️⃣ Esperar a que el media object esté listo
        let status = 'IN_PROGRESS';
        while (status === 'IN_PROGRESS') {
            await delay(3000);
            const statusRes = await axios.get(`https://graph.instagram.com/${mediaId}`, {
                params: { fields: 'status_code', access_token: ACCESS_TOKEN }
            });
            status = statusRes.data.status_code;
            console.log('🔄 Estado del media:', status);
        }

        if (status !== 'FINISHED') throw new Error('El contenido multimedia no se procesó correctamente.');

        // 6️⃣ Publicar
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

        console.log('🚀 Publicado en Instagram!', publishRes.data);

    } catch (err) {
        if (err.response) console.error('❌ Error API:', err.response.data);
        else if (err.request) console.error('❌ No se recibió respuesta:', err.message);
        else console.error('❌ Error inesperado:', err.message);
    }
}

// Ejecutar
publicarInstagram();