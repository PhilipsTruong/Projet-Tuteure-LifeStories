const fs = require('fs');
const path = require('path');
const transformer = require('enketo-transformer');
const { parse } = require('csv-parse/sync');
const { XMLParser } = require('fast-xml-parser');


// Fonction CSV → XML instance
function csvToInstance(csvPath, instanceId) {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true
    });

    let items = '';

    records.forEach(row => {
        items += `
        <item>
            <id>${row.id}</id>
            <name>${row.name}</name>
        </item>`;
    });
    return `
        <instance id="${instanceId}">
            <root>
                ${items}
            </root>
        </instance>`;
}


// 1. Lire le contenu du fichier XML (formulaire LifeStories)
const xformPath = './form.xml';
let xformString;

try {
    xformString = fs.readFileSync(xformPath, 'utf-8');
} catch (err) {
    console.error("Fichier form.xml introuvable. Veuillez vérifier le chemin !");
    process.exit(1);
}

console.log("Traitement de la transformation en cours...");

// 2. Exécuter la fonction de transformation
transformer.transform({
    xform: xformString,
    theme: 'formhub' 
})
.then(result => {
    let model = result.model;
    const semanticJson = extractSemanticModel(model);

    // 🔍 détecter les CSV
    const regex = /<instance id="([^"]+)" src="jr:\/\/file-csv\/([^"]+)"\s*\/>/g;

    let match;
    while ((match = regex.exec(model)) !== null) {
        const instanceId = match[1];
        const fileName = match[2];

        const csvPath = path.join(__dirname, 'file-csv', fileName);
        console.log(csvPath)
        console.log(`📄 Injection CSV : ${fileName}`);

        const xmlInstance = csvToInstance(csvPath, instanceId);

        model = model.replace(match[0], xmlInstance);
    }

    // 4. Enregistrer les résultats dans des fichiers pour le Frontend
    fs.writeFileSync('./output_form.html', result.form);
    fs.writeFileSync('./output_model.xml', model);
    fs.writeFileSync('./semantic_model.json', JSON.stringify(semanticJson, null, 2));

    console.log("Transformation réussie !");
    console.log("Fichier d'interface généré : output_form.html");
    console.log("Fichier de structure de données généré : output_model.xml");
    console.log("JSON sémantique généré : semantic_model.json");
})
.catch(function(error) {
    console.error("Une erreur est survenue lors de la transformation :", error);
});

function extractSemanticModel(xmlString) {

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
    });

    const jsonObj = parser.parse(xmlString);
    let semantic = buildSemantic(jsonObj); // Construit le modèle sémantique de base correspondant exactement au questionnaire

    semantic = mergeAttributes(semantic); // On fusionne les attributs dupliqués
    semantic = dedupeEpisodes(semantic); // On supprime les épisodes en double
    semantic = enrichPrimaryAttributes(semantic); // On enrichit les attributs par l'information "primaire" ou "secondaire"
    
    return semantic;
}

function buildSemantic(json) {

    const semantic = { trajectories: [] };

    const trajMap = new Map(); // id -> traj
    const attrMap = new Map(); // trajId::attrId -> attr
    const epMap = new Map();   // attrKey::epId -> ep

    const walk = (node, ctx = {}) => {

        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            node.forEach(n => walk(n, ctx));
            return;
        }

        for (const [k, v] of Object.entries(node)) {

            // TRAJECTOIRE
            if (k.startsWith('grp_traj_')) {

                if (!trajMap.has(k)) {
                    const traj = {
                        id: k,
                        attributes: []
                    };

                    trajMap.set(k, traj);
                    semantic.trajectories.push(traj);
                }

                walk(v, { traj: trajMap.get(k) });
                continue;
            }

            // ATTRIBUT
            if (k.startsWith('A_')) {

                const traj = ctx.traj;
                if (!traj) continue;

                const attrKey = `${traj.id}::${k}`;

                if (!attrMap.has(attrKey)) {

                    const attr = {
                        id: k,
                        episodes: [],
                        events: [],
                        type: null,
                        dependsOn: ctx.attr?.id || null
                    };

                    attrMap.set(attrKey, attr);
                    traj.attributes.push(attr);
                }

                walk(v, { ...ctx, attr: attrMap.get(attrKey) });
                continue;
            }

            // EPISODE / EVENT
            if (k.startsWith('E_') || k.startsWith('EV_')) {

                const attr = ctx.attr;
                if (!attr) continue;

                const epKey = `${attr.id}::${k}`;

                if (!epMap.has(epKey)) {

                    const ep = {
                        id: k,
                        question: null,
                        value: null,
                        descriptors: [],
                        startDate: null,
                        endDate: null,
                        status: null
                    };

                    epMap.set(epKey, ep);
                    attr.episodes.push(ep);
                }

                walk(v, { ...ctx, ep: epMap.get(epKey) });
                continue;
            }

            // champs épisode
            if (ctx.ep) {

                if (k.startsWith('Q_')) ctx.ep.question = k;
                else if (k.startsWith('V_')) ctx.ep.value = k;
                else if (k.startsWith('SD_')) ctx.ep.startDate = k;
                else if (k.startsWith('ED_')) ctx.ep.endDate = k;
                else if (k.startsWith('ST_')) ctx.ep.status = k;
                else if (k.startsWith('D_')) {
                    if (!ctx.ep.descriptors.includes(k)) {
                        ctx.ep.descriptors.push(k);
                    }
                }
            }

            walk(v, ctx);
        }
    };

    walk(json);

    return semantic;
}

function normalizeAttrId(id) {
    return id.replace(/\d+$/, '');
}

/* A cause de la structure du formulaire, certains attributs sont dupliqués : exemple "A_Status_Emploi" et "A_Status_Emploi2".
 * On les traite alors comme un seul attribut. On fusionne leurs épisodes et événements.
 */
function mergeAttributes(semantic) {

    semantic.trajectories.forEach(traj => {

        const map = new Map();

        for (const attr of traj.attributes) {

            const baseId = normalizeAttrId(attr.id);

            if (!map.has(baseId)) {

                // on clone proprement
                map.set(baseId, {
                    id: baseId,
                    episodes: [...attr.episodes],
                    events: [...(attr.events || [])],
                    type: attr.type,
                    dependsOn: attr.dependsOn || null
                });

            } else {

                const existing = map.get(baseId);

                // merge épisodes
                existing.episodes.push(...attr.episodes);

                // merge events
                existing.events.push(...(attr.events || []));

                // optionnel : garder type le plus riche
                if (!existing.type && attr.type) {
                    existing.type = attr.type;
                }
            }
        }

        traj.attributes = [...map.values()];
    });

    return semantic;
}

function dedupeEpisodes(semantic) {

    semantic.trajectories.forEach(traj => {

        traj.attributes.forEach(attr => {

            const seen = new Set();

            attr.episodes = attr.episodes.filter(ep => {

                const key = ep.id;

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
            });
        });
    });

    return semantic;
}

function enrichPrimaryAttributes(semantic) {

    semantic.trajectories.forEach(traj => {

        if (!traj.attributes || traj.attributes.length === 0) return;

        traj.attributes.forEach((attr, index) => {

            attr.type = (index === 0) ? 'primary' : 'secondary';
        });
    });

    return semantic;
}

//TODO: Fonction pour l'héritage de date : Si dependsOn , on hérite
