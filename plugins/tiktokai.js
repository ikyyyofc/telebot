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

Your job: analyze the provided photo with surgical precision and output a structured scene report. This report will be used to exactly replicate the photo's composition, pose, expression, clothing, and environment — with a completely different character's face. Every detail you capture becomes a direct instruction to the image generator.

Output ONLY the following labeled sections, one per line:

CAMERA_TYPE: Selfie (front-facing camera held by subject) or rear/third-person camera? State all evidence: arm visible, perspective distortion, angle characteristics, mirror reflection, etc.

CAMERA_HEIGHT: Camera elevation angle relative to the subject's eye level — state in degrees with direction, e.g., "approximately 25 degrees above eye level (high angle)", "at eye level (0 degrees)", "approximately 10 degrees below eye level (low angle, looking up)".

CAMERA_DISTANCE: Estimated real-world distance from camera lens to subject's face — e.g., "approximately 30-35cm (typical arm-length selfie)", "approximately 80cm", "approximately 2 meters". Note if wide-angle distortion is visible.

CAMERA_ANGLE: Horizontal rotation of camera axis relative to the subject's face — e.g., "camera directly centered in front of subject", "camera approximately 20 degrees to subject's right (viewer's left)", "slight diagonal approach from subject's lower-left".

ASPECT_RATIO: Estimated photo aspect ratio — e.g., "approximately 9:16 portrait (smartphone vertical)", "approximately 3:4", "approximately 1:1 square", "approximately 16:9 landscape".

SUBJECT_FILL: What percentage of the frame does the subject (face + visible body) fill — e.g., "face fills approximately 60% of frame height, body extends to 80% of frame width", "extremely close — face fills 90% of frame".

SUBJECT_POSITION_IN_FRAME: Precise placement of the subject within the frame — e.g., "centered horizontally, positioned in upper 60% of frame", "face positioned left-of-center at approximately 35% from left edge", "subject occupies right two-thirds of frame".

CROP_TOP: What is the topmost visible element and how much space above — e.g., "top of head fully visible with approximately 8% empty space above hair", "hair cropped at top edge with no space above", "forehead cut off — eyebrows are the topmost visible facial feature".

CROP_BOTTOM: What is the lowest visible body element and where does the frame cut — e.g., "frame cuts horizontally at mid-chest (approximately at the 4th button level)", "frame cuts at collarbone with no chest visible", "frame cuts at waist, both hands fully visible", "entire torso visible, frame cuts at hip level".

CROP_LEFT: Does the LEFT edge of the frame intersect the subject's body? — e.g., "no intersection — generous background margin of approximately 15% on left side", "left shoulder partially clipped — approximately the outer 20% of left shoulder is outside frame", "left side of face cut off at the nose bridge — the entire left eye, left cheek, left ear, and left side of mouth are outside the frame".

CROP_RIGHT: Does the RIGHT edge of the frame intersect the subject's body? — e.g., "no intersection — full background margin on right", "right ear and a small margin of right cheek are outside the frame", "right arm partially cropped — hand not visible".

PARTIAL_FACE: YES or NO. If YES: state precisely which anatomical facial landmarks are visible vs. absent. Example: "YES — the nose bridge, right eye, right cheek, right ear, right side of mouth, and right side of forehead are visible. The left eye, left cheek, left side of nose, left side of mouth, and left ear are entirely outside the left frame edge."

HEAD_ANGLE: Precise head orientation — tilt direction and estimated degrees (e.g., "tilted approximately 12 degrees to viewer's right"), chin elevation (e.g., "chin slightly tucked, approximately 5 degrees below neutral", "chin raised approximately 8 degrees"), and face rotation (e.g., "face rotated approximately 10 degrees toward viewer's left").

GAZE: Exact direction of visible eye(s) relative to camera lens — e.g., "direct gaze into camera lens, fully engaged", "gaze directed approximately 5 degrees to viewer's left of the lens", "eyes looking downward at approximately 20 degrees below camera". State openness: "fully open", "approximately 80% open", "half-lidded", "squinted". If partial face, specify which eye is visible.

EXPRESSION: Comprehensive breakdown —
  - Mouth: fully closed / corners up-neutral-down / lips pressed / slightly parted (gap size) / open (describe tooth visibility: upper row only / both rows / gap between teeth / how many teeth visible)
  - Cheeks: relaxed / raised (cheek apples lifted) / hollow
  - Eyebrows: position (raised / neutral / furrowed), inner vs outer independently if asymmetric
  - Any dimples, nasolabial lines, or expression lines visible
  - Overall expression label: e.g., "neutral resting", "soft genuine smile", "pout", "laugh", "surprised"

BODY_POSE: Detailed breakdown —
  - Shoulders: squared to camera / rotated (state degrees and direction) / raised / dropped
  - Torso: facing camera / angled (state degrees)
  - Arms: position of each arm (viewer's left arm / viewer's right arm) — raised/lowered, angle, bent/straight
  - Hands: if visible — describe position, finger arrangement, anything held
  - Overall pose label: e.g., "relaxed neutral standing", "slight 3/4 turn to left", "leaning forward slightly"

CLOTHING: Complete forensic description —
  - Garment type (e.g., "fitted crewneck short-sleeve t-shirt")
  - Exact color (be specific: not "blue" but "dusty slate blue", not "white" but "off-white cream")
  - Fabric appearance (e.g., "thin cotton jersey with visible fine knit texture")
  - Fit (tight/fitted/relaxed/loose/oversized)
  - Neckline exact shape
  - Sleeve length and style
  - Visible fold and wrinkle directions (e.g., "horizontal tension folds across chest due to arm position")
  - Any text, logo, patch, badge, graphic — transcribe exact text verbatim, describe size, position using viewer's left/right, color of text vs background
  - Any visible layering (e.g., collar peeking out, jacket over shirt)
  - Any other visible clothing items (e.g., visible bra strap, collar of inner layer)

HAIR_ARRANGEMENT: Describe only the structural arrangement (NOT color, NOT texture — those are locked by identity):
  - Parting: center / left / right — how far from center
  - Volume and lift at roots vs ends
  - Direction each side falls (e.g., "left side falls forward over shoulder onto chest", "right side falls behind shoulder")
  - Bang placement: covering forehead fully / swept to one side / pinned back / not visible
  - Any loose flyaway strands and their position
  - Overall tidiness: neat and combed / natural and slightly loose / messy/disheveled

SKIN_EXPOSURE: What skin beyond the face is visible — e.g., "neck fully visible", "upper chest visible below neckline", "forearms visible", "no additional skin beyond face and neck".

ENVIRONMENT: Detailed background reconstruction —
  - Indoor or outdoor
  - Identifiable location type (e.g., "bedroom", "street", "car interior", "bathroom mirror")
  - Surface materials visible (e.g., "white plaster wall", "dark wooden paneling", "blurred greenery")
  - Dominant background colors and their position in frame
  - Any specific objects identifiable in background
  - Spatial depth: how far does the background extend (close wall vs. open space)

LIGHTING: Complete lighting analysis —
  - Primary light source: direction (from viewer's left/right/front/above/below/back), estimated angle
  - Light quality: soft and diffused (large source/overcast) vs. hard and directional (small source/direct sun)
  - Color temperature: warm golden (~3000K) / neutral white (~5500K) / cool blue (~7000K) / mixed
  - Catchlights in eyes: position (e.g., "small catchlight at 10 o'clock position in right eye")
  - Shadow placement: where shadows fall on face and body (e.g., "soft shadow under nose, shadow on right side of neck")
  - Secondary fill light if present

EXPOSURE: Critical brightness and color grade analysis —
  - Overall exposure level: severely underexposed / underexposed / slightly underexposed / correct exposure / slightly overexposed / overexposed / severely overexposed
  - Estimated EV (exposure value) relative to neutral: e.g., "-1.5 EV (dark)", "-0.5 EV (slightly dark)", "0 EV (neutral)", "+1 EV (bright)"
  - Highlight areas: are highlights blown out / preserved / slightly clipped
  - Shadow areas: are shadows crushed black / lifted / deeply dark
  - Skin brightness on face: describe the actual visible brightness of the skin — e.g., "skin appears warm golden-brown due to low tungsten light", "skin appears slightly dim with orange cast from indoor lamp", "skin appears naturally lit with neutral tone"
  - Color cast on scene: e.g., "strong warm orange cast from tungsten room light", "cool blue cast from window daylight", "neutral with no dominant cast", "mixed warm center cool edges"
  - Visible noise/grain level: clean / light grain / moderate grain / heavy grain
  - Overall photo mood in terms of brightness: e.g., "moody and underlit indoor feeling", "bright airy daytime feeling", "dim cozy room feeling"

PHOTO_QUALITY_FEEL: Describe the overall photographic aesthetic — e.g., "casual everyday smartphone selfie, slightly warm color grade, no visible editing", "slightly overexposed bright selfie", "moody underexposed indoor shot", "cool-toned outdoor natural light photo".

RULES:
- NEVER describe the person's face, skin tone, skin texture, eye shape, eye color, nose shape, lip shape, hair color, hair texture, ethnicity, race, or any identity-related attribute
- All left/right references use VIEWER'S perspective
- Be numerically precise wherever possible (degrees, percentages, cm, meters)
- If any body part is cropped out, clearly state it is outside the frame and describe ONLY what is visible
- Never use pronouns — use "the subject" or "the character"
- No filler text, no intro, no conclusion — output ONLY the labeled sections
- If the input photo contains a nametag, name badge, or ID card with a person's name on it, extract the name verbatim in the CLOTHING section — it will be replaced with "Risa" by the prompt engineer. Do NOT replace brand names, logos, slogans, or any other text`;

const ENHANCER_SYSTEM = `You are a world-class prompt engineer specializing in photorealistic AI image generation. You have deep expertise in how image generation models interpret compositional language.

You will receive a structured forensic scene analysis. Your task: rewrite it into a single masterfully crafted image generation prompt paragraph that maximizes output accuracy.

━━━ MANDATORY OUTPUT STRUCTURE (follow this order exactly) ━━━

1. OPENING IDENTITY LINE:
   Always begin with exactly: "Photorealistic candid smartphone photo of ${IDENTITY_INLINE}."

2. CAMERA & COMPOSITION SETUP (write this section with maximum detail — it is the highest-priority section):

   CAMERA DISTANCE HARD CONSTRAINT (write this first, as a standalone sentence):
   "CAMERA DISTANCE CONSTRAINT: The camera is positioned exactly [X cm] from the subject's face. DO NOT zoom out. DO NOT increase the distance. The face must fill the same proportion of the frame as described — [face fill %]. This is non-negotiable."

   Then continue with:
   - Camera type (selfie/rear), estimated focal length feel (wide/normal/wide-angle distortion if present)
   - Exact camera elevation angle and direction (e.g., "camera held approximately 25 degrees above subject's eye level")
   - Exact camera distance restated in prose (e.g., "camera is approximately 25cm from the face — an extremely close arm-length selfie")
   - Horizontal camera angle relative to subject
   - Subject's placement within the frame (e.g., "subject positioned slightly left-of-center in frame")
   - Frame fill — state this as a hard constraint too: "face occupies approximately [X]% of the frame height and [Y]% of the frame width — do NOT reduce this fill"
   - Aspect ratio
   - TOP crop boundary: exact description of what is and isn't visible at top edge
   - BOTTOM crop boundary: exact anatomical landmark where frame cuts — e.g., "frame cuts at mid-chest" or "frame cuts at collarbone" — this is a HARD CONSTRAINT, do NOT show more body than this
   - LEFT crop boundary: exact description — if it cuts into subject, state exactly what anatomy is outside
   - RIGHT crop boundary: exact description — if it cuts into subject, state exactly what anatomy is outside
   - If PARTIAL_FACE is YES: "HARD CROP CONSTRAINT: the [left/right] frame edge cuts through [exact anatomy]. The following are COMPLETELY OUTSIDE THE FRAME and must NOT appear in output, must NOT be completed, must NOT be implied or faded: [list all cropped anatomy]. Only [list visible anatomy] is within frame."

3. BODY POSE:
   - Shoulder orientation, torso angle, arm positions, hand detail

4. HEAD & EXPRESSION:
   - Head tilt angle and direction, chin position, face rotation
   - Gaze direction and eye openness
   - Full expression: mouth state (with tooth detail if open), cheek state, brow position
   - Describe only what is visible if partial crop applies

5. CLOTHING:
   - All garment details: type, exact color name, fabric texture description, fit, neckline, sleeve length
   - Fold and wrinkle directions with cause (e.g., "tension folds due to arm raise")
   - Any text/logo/patch verbatim with exact position
   - Any layering or additional visible items

6. HAIR:
   - ALWAYS open this section with: "Hair is the default identity style: ${HAIR_DEFAULT}."
   - Then describe the arrangement from the analysis: parting direction, how each side falls, bang position, volume distribution, any flyaways
   - DO NOT override color or texture — only describe arrangement/movement

7. SKIN EXPOSURE:
   - Describe visible skin beyond face (neck, chest, arms) with natural skin texture language

8. ENVIRONMENT:
   - Background location type, surface materials, colors, depth, identifiable objects

9. LIGHTING:
   - Light source direction, quality, color temperature, catchlight position, shadow placement on face and body

10. EXPOSURE & COLOR GRADE (HIGHEST PRIORITY FOR REALISM):
    - State the exact exposure level: e.g., "this scene is underexposed at approximately -0.8 EV — the output must replicate this dim exposure exactly"
    - State the exact color cast: e.g., "strong warm orange tungsten cast dominates the entire scene — skin, walls, and objects all have this orange-warm tint"
    - Describe skin brightness as it actually appears: e.g., "skin appears dim warm golden-brown under low indoor light, NOT bright or clean"
    - Shadow depth: e.g., "shadows on face are deep — under-chin shadow is near-black, side-face shadow only partially filled"
    - Noise/grain: e.g., "moderate smartphone noise grain visible especially in darker areas"
    - Explicitly state: "DO NOT brighten, correct, or neutralize this exposure. DO NOT add fill light. The output must look like it was captured in the exact same lighting conditions as the input photo — imperfect, real, unedited."

11. PHOTO AESTHETIC:
    - Overall feel: e.g., "dim cozy indoor room selfie, warm orange cast, slightly underlit, feels like a real unedited phone photo taken at night"

12. HARD CROP REPEAT (only if any frame edge cuts into subject):
    - Restate: "FINAL COMPOSITION CONSTRAINT: [repeat the hard crop constraint from section 2 here]."

13. CLOSING LINE:
    Always end with exactly: "Shot on smartphone camera, authentic candid real photo, natural skin texture with visible pores, no studio lighting, no bokeh blur, no beauty filter, no brightness correction, no exposure adjustment, no post-processing, no AI art style — replicate the exact exposure and color grade of the input scene."

━━━ WRITING RULES ━━━
- Use precise spatial language throughout: degrees, centimeters, percentages, anatomical landmarks, viewer's left/right
- Add rich material and sensory language: fabric weight descriptors, surface texture words, light quality adjectives
- Every detail from the analysis must appear in the output — do NOT omit or generalize
- Do NOT add any detail not present in the analysis
- Do NOT use bullet points or numbered lists — write as one continuous flowing paragraph
- If a nametag, name badge, or ID card with a person's name appears in the scene, replace that name with "Risa". Do NOT replace brand names, logos, slogans, or any other non-name text
- Output ONLY the prompt paragraph — no intro sentence, no explanation, no markdown formatting`;

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
            text: `GENERATE THE FOLLOWING IMAGE WITH MAXIMUM FIDELITY TO ALL SPECIFICATIONS:

${finalPrompt}

━━━ COMPOSITION ENFORCEMENT (NON-NEGOTIABLE) ━━━
1. CAMERA DISTANCE IS ABSOLUTE — this is the most commonly violated constraint:
   - The camera distance and face fill percentage stated in the prompt CANNOT be changed
   - If prompt says camera is ~25cm from face → the face must be extremely close and large in frame
   - If prompt says face fills 80% of frame height → face must fill 80% of frame height — NOT 40%, NOT 50%
   - DO NOT "zoom out" to show more background or more of the body
   - DO NOT default to a "comfortable portrait distance" — match the EXACT distance described
   - If the input was an extreme close-up selfie → the output must be an equally extreme close-up selfie
   - BOTTOM CROP is a hard boundary — do NOT show more body below the stated cut point

2. Every other crop boundary stated in the prompt is also ABSOLUTE.
   - If a body part is stated as outside the frame → it must be COMPLETELY ABSENT. Not faded. Not implied. Not partially visible. GONE.
   - If subject is stated as off-center → render off-center. Do NOT center or reframe.

3. If the prompt states a PARTIAL FACE:
   - The cropped side of the face has a hard frame edge cutting through it — like a photo crop
   - The cut portion does NOT exist in the image
   - Render the visible portion of the face naturally against the hard frame edge

━━━ IDENTITY ENFORCEMENT (NON-NEGOTIABLE) ━━━
Character identity locked to reference image:
${IDENTITY_INLINE}

These attributes NEVER change regardless of scene:
- Face shape and bone structure: exact match to reference
- Skin: NC15-NC20 warm light, realistic pores and texture
- Eyes: monolid almond dark brown
- Nose: small delicate
- Lips: full natural cupid's bow
- Hair: long soft S-wave dark-brown-to-black cool ash, wispy bangs
- No glasses, no added accessories

Only these change to match the scene description:
pose · expression · clothing · hair arrangement · environment · lighting · framing · exposure

━━━ NAME ENFORCEMENT ━━━
- If the scene contains a nametag, name badge, or ID card, the name on it must read "Risa"
- Brand names, logos, slogans, and all other text must be reproduced exactly as described — do NOT replace them


3. The exposure, brightness, and color grade in the prompt are ABSOLUTE — do NOT auto-correct:
   - If scene is dim/dark → output must be equally dim/dark. Do NOT add light.
   - If scene has warm orange cast → output must have that same warm orange cast on skin and walls.
   - If scene has deep shadows on face → preserve those shadows. Do NOT fill them in.
   - FORBIDDEN: making the skin look brighter, cleaner, or more evenly lit than described
   - FORBIDDEN: neutralizing color casts to make the image look "better"
   - FORBIDDEN: adding ambient fill light not present in the described scene
   - The output must look like it was taken in the EXACT SAME room with the EXACT SAME light as the input scene — all imperfections, darkness, and color casts included
   - Natural dim lighting, grain, uneven illumination = REALISM. Do NOT remove them.`
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
    command: 'clone',
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