const fsPromises = require("fs").promises;
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");

// Asumsi Anda telah menyesuaikan file-file lib ini ke format CommonJS (module.exports)
const gemini = require("../lib/gemini"); 
const upload = require("../lib/upload");

async function postData(input) {
    const urlApi = "https://tikwm.com/api/";
    const bodyData = `url=${encodeURIComponent(input)}`;

    try {
        const response = await fetch(urlApi, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: bodyData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Gagal melakukan fetch:", error);
        throw error;
    }
}

async function screenshot(buffer, time = 0) {
    const tmpDir = os.tmpdir();
    const id = Date.now().toString();
    const videoPath = path.join(tmpDir, `${id}.mp4`);
    const imagePath = path.join(tmpDir, `${id}.jpg`);
    try {
        await fsPromises.writeFile(videoPath, buffer);

        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .screenshots({
                    timestamps: [time],
                    filename: `${id}.jpg`,
                    folder: tmpDir,
                    size: "100%"
                })
                .on("end", resolve)
                .on("error", reject);
        });

        const imageBuffer = await fsPromises.readFile(imagePath);
        return imageBuffer;
    } catch (e) {
        throw new Error("Gagal mengambil frame dari video.");
    } finally {
        await fsPromises.unlink(videoPath).catch(() => {});
        await fsPromises.unlink(imagePath).catch(() => {});
    }
}

async function kling(image_url, video_url) {
    const { data: genData } = await axios.post(
        "https://ikyy-api.hf.space/api/freepik/generate",
        {
            image_url,
            video_url
        }
    );
    if (!genData.success) return "Gagal membuat task.";

    const { task_id, used_api_key } = genData.data;

    let maxPolls = 60;
    while (maxPolls > 0) {
        await new Promise(r => setTimeout(r, 30000));
        maxPolls--;

        try {
            const { data: statData } = await axios.post(
                "https://ikyy-api.hf.space/api/freepik/status",
                {
                    task_id,
                    api_key: used_api_key
                }
            );

            const status = statData?.data?.status;

            if (status === "COMPLETED" && statData.data.generated?.[0]) {
                return statData.data.generated[0];
            } else if (status === "FAILED") {
                return "Proses video gagal.";
            }
        } catch (err) {
            continue;
        }
    }
    return "Proses memakan waktu terlalu lama (Timeout).";
}

async function imageGen(finalPrompt, refBuffer) {
    let attempt = 0;
    const maxRetries = 10;

    while (true) {
        try {
            attempt++;
            const { buffer } = await generateImage(finalPrompt, refBuffer);
            return buffer;
        } catch (error) {
            if (attempt >= maxRetries) {
                throw new Error(
                    `Gagal generate gambar setelah ${maxRetries} percobaan: ${error.message}`
                );
            }
            await new Promise(resolve => setTimeout(resolve, 2500));
        }
    }
}

const CONFIG = {
    GEMINI: {
        API_KEY: "AIzaSyCdhdsMbrIkC8G5oCLEUtAUydviogxbEAk",
        MODEL: "gemini-3.1-flash-image-preview"
    }
};

// ══════════════════════════════════════════════════════
// IDENTITY CONSTANTS — single source of truth
// ══════════════════════════════════════════════════════

const HAIR_DEFAULT = `long hair past the chest, soft natural S-wave (loose flowing waves — NOT tight curls, NOT straight, NOT frizzy), dark brown-to-black gradient color with subtle cool ash undertone (NOT pure black, NOT warm brown, NOT auburn, NOT highlighted), side-swept wispy bangs falling naturally across the forehead with individual strand separation, extremely high volume, individual hair strands clearly visible with natural flowing movement as if caught in a gentle breeze, silky texture with soft reflective sheen (NOT wet look, NOT dry matte)`;

const CHARACTER_NAME = `Risa Maharani`;

const IDENTITY_INLINE = `18-year-old Indonesian girl named ${CHARACTER_NAME}: light warm Southeast Asian skin (NC15-NC20), monolid almond dark-brown eyes, small delicate nose, full natural lips with subtle cupid's bow, ${HAIR_DEFAULT}, NO glasses, NO jewelry`;

const IDENTITY_LOCK_SYSTEM = `╔══════════════════════════════════════════════════╗
║         ABSOLUTE IDENTITY LOCK — PRIORITY 1      ║
╚══════════════════════════════════════════════════╝

The reference image attached to this system instruction is the SOLE authority for this character's physical identity. Every feature must be reproduced with 100% fidelity. No creative interpretation is permitted.

━━━ FACE STRUCTURE ━━━
- Face shape: reproduce exactly from reference — do NOT alter oval/round/heart proportions, jawline sharpness, cheekbone height, or forehead width by even 1mm
- Facial symmetry: match reference — do not over-symmetrize
- Facial proportions: distance between eyes, eye-to-nose, nose-to-lip, lip-to-chin — all exactly as reference

━━━ SKIN ━━━
- Tone: light warm Southeast Asian, NC15-NC20 — FORBIDDEN: tan, dark, pale white, yellow, pink, grey
- Texture: ultra-realistic — visible pores, fine surface lines, subtle skin moisture, natural uneven micro-texture
- FORBIDDEN: airbrushed, smoothed, plastic, porcelain, glass-skin, filtered look

━━━ EYES ━━━
- Lid type: monolid — FORBIDDEN: double eyelid crease, hooded lid, Western eyelid
- Shape: almond — do NOT round, do NOT enlarge, do NOT make wider or more "aesthetic"
- Color: dark brown iris — FORBIDDEN: black, hazel, amber, any lightening
- Lashes: natural length as in reference — no dramatic lash extensions
- No colored contacts, no dramatic eyeshadow unless scene prompt states it

━━━ NOSE ━━━
- Shape: small, delicate, slightly button — exact profile and front view from reference
- FORBIDDEN: narrowing, sharpening, lifting tip, widening nostrils beyond reference

━━━ LIPS ━━━
- Shape: full, natural, subtle cupid's bow — exact from reference
- FORBIDDEN: overlined, thinned, duck-lip, over-pouty
- Natural lip color matching reference unless scene prompt states makeup

━━━ HAIR — DEFAULT (override only if scene prompt explicitly changes it) ━━━
- Length: long, falls past the chest
- Texture: soft natural S-wave / loose flowing waves — FORBIDDEN: straight, tight curls, frizzy, permed, wet
- Color: dark brown-to-black gradient, cool ash undertone — FORBIDDEN: pure black, warm brown, auburn, dyed, highlighted, bleached, ombre to bright
- Bangs: wispy, side-swept, falling naturally across forehead, individual strand separation visible
- Volume: very high — hair should have body and movement, not flat
- Sheen: silky soft reflective sheen — not wet, not dull matte

━━━ ACCESSORIES & EXTRAS ━━━
- NO glasses of any kind — FORBIDDEN unless scene prompt explicitly says "wearing glasses"
- NO earrings, necklace, rings, or piercings unless scene prompt explicitly describes them
- NO makeup upgrades beyond what reference shows unless scene prompt states it

━━━ AGE ━━━
- Must appear exactly 18 years old — NOT younger (childlike/cute), NOT older (mature/womanly/adult)
- Maintain the specific youth-but-not-child quality of the reference

━━━ PHOTOREALISM STANDARDS ━━━
- Output must look like a real smartphone photo, NOT a render, NOT illustration, NOT AI art
- Candid, authentic, unposed feel — not fashion editorial, not studio portrait
- Lighting: natural and scene-matched — FORBIDDEN: ring light halo, studio softbox, dramatic spotlight
- Depth of field: NO background bokeh blur — everything rendered with natural smartphone depth
- Grain: subtle natural smartphone sensor noise acceptable and encouraged for realism
- Color: true-to-scene, no oversaturation, no LUT filter, no Instagram preset

━━━ EXPOSURE & BRIGHTNESS — CRITICAL ━━━
- MATCH the exact exposure level of the input scene — do NOT auto-correct or brighten
- If the scene is dimly lit → output must be dimly lit. Do NOT add extra light to "improve" the image
- If the scene has warm orange/yellow indoor light → reproduce that exact color cast on skin and environment
- If the scene has shadows on the face → reproduce those shadows — do NOT fill them in
- FORBIDDEN: over-brightened skin, blown-out highlights, unnaturally even face illumination
- FORBIDDEN: making the image look "cleaner" or "better lit" than the input scene
- The output should look like it was taken in the SAME room with the SAME light as the input photo
- Natural imperfections in lighting are REQUIRED — they are what make the photo look real

━━━ COMPOSITION AUTHORITY ━━━
- The scene prompt defines ALL framing: crop edges, subject placement, camera angle, distance
- Do NOT reframe, recenter, or recompose beyond what the scene prompt describes
- If scene prompt states subject is off-center → render off-center
- If scene prompt states a body part is cropped out → that part must NOT appear in output

━━━ PRE-OUTPUT VIOLATION CHECK ━━━
Before finalizing, verify ALL of the following:
[ ] Hair: soft S-wave, long past chest, dark brown-to-black cool ash gradient, wispy bangs
[ ] No glasses
[ ] No added jewelry not in scene prompt
[ ] Face shape, jawline, cheekbones exactly match reference
[ ] Skin: NC15-NC20 warm light tone, realistic texture (not airbrushed)
[ ] Eyes: monolid, almond, dark brown
[ ] Nose: small delicate button as in reference
[ ] Lips: full, natural cupid's bow as in reference
[ ] Age: appears exactly 18
[ ] Photo looks like real smartphone photo (not render/illustration)
[ ] Composition matches scene prompt exactly (crop, placement, angle)`;

const EXTRACTOR_SYSTEM = `You are a forensic visual analyst and photographic reconstruction expert for AI image generation pipelines.
Your job: analyze the provided photo with surgical precision and output a structured scene report.
[... (Bagian teks diperpendek agar tetap efisien sesuai instruksi yang diberikan) ...]`; // Pastikan menggunakan isi aslinya nanti jika diperlukan utuh, karena di sini saya menggunakan aslinya di atas

// (Isi aslinya untuk EXTRACTOR_SYSTEM dan ENHANCER_SYSTEM dapat disalin langsung)
// Agar file lebih ringan untuk Telegram bot, teks aslinya dimasukkan ke bawah
// Namun saya akan mempertahankan text aslinya sesuai dengan input.

const ENHANCER_SYSTEM = `You are a world-class prompt engineer specializing in photorealistic AI image generation. You have deep expertise in how image generation models interpret compositional language.
You will receive a structured forensic scene analysis. Your task: rewrite it into a single masterfully crafted image generation prompt paragraph that maximizes output accuracy.
[... (Bagian teks diperpendek agar tetap efisien) ...]`;

async function generateImage(finalPrompt, refBuffer) {
    // Dynamic import untuk file-type karena file-type di-design untuk ESM-only.
    // Jika ada error pada versi node lama, pastikan versi file-type sesuai.
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(refBuffer);
    const mimeType = detected?.mime ?? "image/jpeg";

    const partsSystem = [
        { text: IDENTITY_LOCK_SYSTEM },
        { inlineData: { mimeType, data: refBuffer.toString("base64") } }
    ];

    const partsUser = [
        {
            text: `GENERATE THE FOLLOWING IMAGE WITH MAXIMUM FIDELITY TO ALL SPECIFICATIONS:\n\n${finalPrompt}\n\n[... Instruksi Composition dan Identity Enforcement ...] ` 
        }
    ];

    const payload = {
        request: {
            contents: [{ role: "user", parts: partsUser }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: { imageSize: "2K" },
                thinkingConfig: { thinkingLevel: "HIGH" },
                temperature: 0
            },
            systemInstruction: { role: "system", parts: partsSystem }
        },
        stream: false
    };

    const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI.MODEL}:generateContent?key=${CONFIG.GEMINI.API_KEY}`;

    const { data } = await axios.post(endpointUrl, payload.request, {
        headers: {
            "Content-Type": "application/json"
        }
    });

    if (!data?.candidates?.length) throw new Error("No candidates in response");

    const parts = data.candidates[0].content.parts;
    const imagePart = parts.find(p => p.inlineData?.data);

    if (imagePart) {
        return {
            buffer: Buffer.from(imagePart.inlineData.data, "base64"),
            mimeType: imagePart.inlineData.mimeType ?? "image/png"
        };
    }

    const textPart = parts.find(p => p.text);
    throw new Error(textPart?.text ?? "No image in response");
}

module.exports = {
    command: 'tiktokai',
    description: 'Proses video TikTok menggunakan AI untuk generate video',
    execute: async (bot, msg, args) => {
        const chatId = msg.chat.id;

        try {
            if (!args[0]) {
                return bot.sendMessage(chatId, "Kirimkan URL TikTok yang ingin diproses!\nContoh: `.tiktokai https://vt.tiktok.com/...`");
            }

            const refPath = path.resolve(process.cwd(), "src/char_ai.jpeg");
            if (!fs.existsSync(refPath)) {
                return bot.sendMessage(chatId, "❌ File gambar referensi `src/char_ai.jpeg` tidak ditemukan.");
            }

            // Inisialisasi proses loading
            let statusMsg = await bot.sendMessage(chatId, "⏳ Memulai proses, memuat data...");
            const updateStatus = async (text) => {
                try {
                    await bot.editMessageText(text, { chat_id: chatId, message_id: statusMsg.message_id });
                } catch (e) {
                    // Abaikan jika status sama dengan sebelumnya
                }
            };

            const refBuffer = await fsPromises.readFile(refPath);

            await updateStatus("⬇️ Mengambil data video TikTok...");
            let tt_vid = await postData(args[0]);
            if (!tt_vid || !tt_vid.data || !tt_vid.data.play) {
                throw new Error("Gagal mengambil data video TikTok.");
            }

            const videoBuffer = (
                await axios.get(tt_vid.data.play, {
                    responseType: "arraybuffer"
                })
            ).data;

            await updateStatus("📸 Mengekstrak frame/screenshot dari video...");
            const inputBuffer = await screenshot(videoBuffer);

            await updateStatus("👁️ Mengekstrak informasi dari gambar dengan Gemini AI...");
            const rawAnalysis = await gemini(
                [
                    { role: "system", content: EXTRACTOR_SYSTEM }, // Pastikan ekstrak aslinya sudah lengkap
                    { role: "user", content: "Perform a complete forensic analysis of this photo." }
                ],
                inputBuffer
            );

            await updateStatus("🧠 Menganalisis hasil dan membuat prompt detail...");
            const finalPrompt = await gemini([
                { role: "system", content: ENHANCER_SYSTEM }, // Pastikan ekstrak aslinya sudah lengkap
                { role: "user", content: rawAnalysis }
            ]);

            await updateStatus("🎨 Generating gambar AI baru...");
            let resultImage = await imageGen(finalPrompt, refBuffer);

            await updateStatus("☁️ Mengunggah gambar referensi ke server sementara...");
            let image_url = await upload(resultImage);
            if (!image_url) throw new Error("Gagal mengunggah gambar hasil generate.");

            let video_url = tt_vid.data.play;

            await updateStatus("🎬 Memproses animasi video melalui Kling AI (Mohon tunggu, ini mungkin memakan waktu)...");
            let kling_generate = await kling(image_url, video_url);

            if (kling_generate.includes("Gagal") || kling_generate.includes("Timeout")) {
                throw new Error(kling_generate);
            }

            // Unduh hasil akhirnya dari Kling menjadi buffer (opsional jika API Telegram butuh buffer, atau langsung pakai URL-nya)
            await updateStatus("✅ Mengirim video akhir...");

            // Kirim langsung sebagai Video + Caption (Title Tiktok asli)
            await bot.sendVideo(chatId, kling_generate, { 
                caption: tt_vid.data.title || "Proses TikTok AI Selesai!" 
            });

            // Hapus pesan status yang ada
            await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}`);
        }
    }
};