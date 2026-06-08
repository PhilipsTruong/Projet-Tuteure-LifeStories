const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const xmlStr = fs.readFileSync('output_model.xml', 'utf8');
const semanticModel = JSON.parse(fs.readFileSync('public/semantic_model.json', 'utf8'));

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();
const xmlDoc = parser.parseFromString(xmlStr, "text/xml");

const anneeNaissanceNodes = xmlDoc.getElementsByTagName("annee_naissance");
let birthYearStr = "2002"; // Mock what user enters

// Mock user entering Grenoble in E_commune_n and age 15
const eCommuneN = xmlDoc.getElementsByTagName("E_commune_n")[1]; // instance 1 (0 is template)
if (eCommuneN) {
    let vCommuneN = eCommuneN.getElementsByTagName("V_commune_n")[0];
    if (vCommuneN) vCommuneN.textContent = "Grenoble";
    
    let ageCommune = eCommuneN.getElementsByTagName("age_arrivee_commune")[0];
    if (ageCommune) ageCommune.textContent = "15";
}

let newItems = [];
semanticModel.trajectories.forEach(traj => {
  traj.attributes.forEach(attr => {
    attr.episodes.forEach(episode => {
        let sdTag = episode.startDate;
        let edTag = episode.endDate;
        
        if (!sdTag && attr.dependsOn) {
            const parentAttr = traj.attributes.find(a => a.id === attr.dependsOn);
            if (parentAttr) {
                const parentEp = parentAttr.episodes.find(e => e.startDate);
                if (parentEp) sdTag = parentEp.startDate;
            }
        }
        if (!edTag && attr.dependsOn) {
            const parentAttr = traj.attributes.find(a => a.id === attr.dependsOn);
            if (parentAttr) {
                const parentEp = parentAttr.episodes.find(e => e.endDate);
                if (parentEp) edTag = parentEp.endDate;
            }
        }
        
        if (!sdTag) {
            sdTag = "annee_naissance";
        }

        const startNodes = sdTag ? xmlDoc.getElementsByTagName(sdTag) : [];
        const endNodes = edTag ? xmlDoc.getElementsByTagName(edTag) : [];
        const valueNodes = episode.value ? xmlDoc.getElementsByTagName(episode.value) : [];

        const maxLen = Math.max(startNodes.length, endNodes.length, valueNodes.length);
        console.log(`Processing episode: ${episode.id}, sdTag: ${sdTag}, maxLen: ${maxLen}`);

        for (let i = 0; i < maxLen; i++) {
            let isTemplate = false;
            let nodeToCheck = startNodes[i] || valueNodes[i] || endNodes[i];
            let p = nodeToCheck;
            while (p) {
                if (p.getAttribute && p.getAttribute("jr:template") !== null) {
                    isTemplate = true;
                    break;
                }
                p = p.parentNode;
            }
            if (isTemplate) {
                console.log(`  Skip template instance i=${i}`);
                continue;
            }

            let sNode = startNodes[i] || (startNodes.length === 1 ? startNodes[0] : null);
            let eNode = endNodes[i] || (endNodes.length === 1 ? endNodes[0] : null);
            let vNode = valueNodes[i] || (valueNodes.length === 1 ? valueNodes[0] : null);

            let startVal = sNode ? sNode.textContent : null;
            let endVal = eNode ? eNode.textContent : null;
            const val = vNode ? vNode.textContent : null;

            console.log(`  Instance i=${i}: startVal='${startVal}', val='${val}'`);

            if ((!startVal || startVal.trim() === "") && vNode) {
                let parent = vNode.parentNode;
                if (parent) {
                    let children = Array.from(parent.childNodes).filter(c => c.nodeType === 1);
                    for (let child of children) {
                        let tag = child.tagName.toLowerCase();
                        let text = child.textContent ? child.textContent.trim() : "";
                        if (text && (!sdTag || tag !== sdTag.toLowerCase())) {
                            if ((tag.includes("annee") || tag.includes("date")) && (tag.includes("arrivee") || tag.includes("debut") || tag.includes("commence"))) {
                                startVal = text;
                                break;
                            } else if (tag.includes("age") && (tag.includes("arrivee") || tag.includes("debut") || tag.includes("commence"))) {
                                if (birthYearStr) {
                                    let age = parseInt(text, 10);
                                    if (!isNaN(age)) {
                                        startVal = (parseInt(birthYearStr, 10) + age).toString();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            console.log(`  After fallback: startVal='${startVal}'`);
            
            if (!startVal || startVal.trim() === "") {
                console.log(`  Skip instance i=${i} due to missing startVal`);
                continue;
            }

            let contentVal = val;
            if ((!contentVal || contentVal.trim() === "") && episode.status) {
                const statusNodes = xmlDoc.getElementsByTagName(episode.status);
                const statNode = statusNodes[i] || (statusNodes.length === 1 ? statusNodes[0] : null);
                if (statNode) contentVal = statNode.textContent;
            }

            if ((!contentVal || contentVal.trim() === "") && episode.value !== null) {
                console.log(`  Skip instance i=${i} due to empty contentVal but expected value`);
                continue;
            }

            if (!contentVal || contentVal.trim() === "") {
                contentVal = episode.id;
            }

            console.log(`  Adding item: ${contentVal} at ${startVal}`);
            newItems.push({ content: contentVal, startVal });
        }
    });
  });
});

console.log("\nFinal Items:");
console.log(newItems);
