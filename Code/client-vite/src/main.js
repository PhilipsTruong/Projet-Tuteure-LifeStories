import { Form } from 'enketo-core';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import Split from 'split.js';

// Configuration de la disposition (Layout)
Split(['#questionnaire', '#trajectories'], {
    sizes: [30, 70],
    minSize: 200,
    gutterSize: 8,
    cursor: 'col-resize',
});
Split(['#canvas', '#bricks'], {
    direction: 'vertical',
    sizes: [70, 30],
    minSize: 150,
    gutterSize: 8,
    cursor: 'row-resize',
});

const html = await fetch('/output_form.html').then(r => r.text());
document.getElementById('app').innerHTML = html;

const modelStr = await fetch('/output_model.xml').then(r => r.text());
const semanticModel = await fetch('/semantic_model.json').then(r => r.json());

const formEl = document.querySelector('form.or');
const data = { modelStr };
const form = new Form(formEl, data, {});
await form.init();

// --- Début de l'intégration avancée de la Timeline ---
const container = document.getElementById('timeline');
const items = new DataSet();
const groups = new DataSet();

// Fonction pour formater le nom du groupe (supprimer les préfixes A_, T_ et mettre en majuscule)
function formatLabel(id) {
    let formatted = id.replace(/^[A-Z]_/i, '');
    formatted = formatted.replace(/_/g, ' ');
    return formatted.replace(/\b\w/g, l => l.toUpperCase());
}

// Mapping des trajectoires vers les couleurs
const colorMap = ["orange-pill", "blue-pill", "green-pill", "yellow-pill"];
const trajColors = {};

semanticModel.trajectories.forEach((traj, index) => {
  trajColors[traj.id] = colorMap[index % colorMap.length];
  // Création du groupe parent (Trajectoire)
  groups.add({ id: traj.id, content: `<div class="group-title">${formatLabel(traj.id)}</div>`, showNested: true });
  // Création des sous-groupes (Attributs)
  traj.attributes.forEach(attr => {
    groups.add({ id: attr.id, content: `<div class="sub-group-title"><span class="dot"></span>${formatLabel(attr.id)}</div>`, nestedInGroup: traj.id });
  });
});

const timelineOptions = {
  stack: true,
  start: new Date(new Date().setFullYear(new Date().getFullYear() - 10)),
  end: new Date(),
  orientation: 'both',
  margin: {item:{vertical: 10, horizontal: 0}},
  align: "center",
};

const timeline = new Timeline(container, items, groups, timelineOptions);

// Logique de la barre de temps verticale personnalisée
const stepSize = 1000 * 60 * 60 * 24; // 1 day
let customTimeId = timeline.addCustomTime(new Date(new Date().setFullYear(new Date().getFullYear() - 1)), "custom-bar");

timeline.on("timechange", function (event) {
  var selectedTime = event.time.getTime();
  var snappedTime = Math.round(selectedTime / stepSize) * stepSize;
  timeline.setCustomTime(new Date(snappedTime), customTimeId);

  // Réinitialiser les surbrillances
  items.forEach((item) => {
    if (item.className && item.className.includes("highlight")) { 
      item.className = item.className.replace(" highlight", "");
      items.update(item);
    }
  });

  const moreInfos = document.getElementById('moreInfos');
  moreInfos.innerHTML = '';
  
  items.forEach((item) => {
    var itemStart = new Date(item.start).getTime();
    var itemEnd = item.end ? new Date(item.end).getTime() : itemStart + stepSize;
    if (snappedTime >= itemStart && snappedTime <= itemEnd) {
      item.className += ' highlight';
      items.update(item);
      
      let groupObject = groups.get(item.group);
      
      // Nettoyer le nom du groupe imbriqué avec formatLabel (pour que la carte Synthèse soit propre)
      let groupName = groupObject.nestedInGroup ? `${formatLabel(groupObject.nestedInGroup)} --> ${formatLabel(item.group)}` : formatLabel(item.group);
      
      let htmlContent = `
                  <div class="synthese-card">
                    <div class="synthese-card-header">${groupName}</div>
                    <h4 class="synthese-card-title">${item.content}</h4>
                    <div class="synthese-card-date">
                      De : ${new Date(item.start).getFullYear()} ${item.end ? `à ${new Date(item.end).getFullYear()}` : ''}
                    </div>
                  </div>`;
      moreInfos.innerHTML += htmlContent;
    }
  });
});

function updateTimeline() {
  const xmlStr = form.getDataStr();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, "text/xml");

  const newItems = [];
  let itemId = 1;

  // Mettre à jour les limites de la timeline en fonction de l'année de naissance
  let birthYearStr = null;
  const anneeNaissanceNodes = xmlDoc.getElementsByTagName("annee_naissance");
  if (anneeNaissanceNodes.length > 0 && anneeNaissanceNodes[0].textContent) {
      birthYearStr = anneeNaissanceNodes[0].textContent;
      const annee = parseInt(birthYearStr, 10);
      if (!isNaN(annee)) {
          let opts = { 
              min: new Date(annee - 5, 0, 1), // Élargir le minimum de 5 ans en arrière pour laisser de l'espace de défilement
              max: new Date(new Date().getFullYear() + 5, 0, 1) // Empêcher de défiler trop loin dans le futur
          };
          
          // Zoom automatique pour voir toute la vie si 4 chiffres sont saisis
          if (birthYearStr.length >= 4 && annee > 1900 && annee <= new Date().getFullYear()) {
              if (!window.hasAutoZoomedToLifespan) {
                  opts.start = new Date(annee - 2, 0, 1);
                  opts.end = new Date(new Date().getFullYear() + 1, 0, 1);
                  window.hasAutoZoomedToLifespan = true;
              }
          } else {
              window.hasAutoZoomedToLifespan = false; // Réinitialiser s'ils effacent et saisissent à nouveau
          }
          
          timeline.setOptions(opts);
      }
  }

  semanticModel.trajectories.forEach(traj => {
    const trajColorClass = trajColors[traj.id] || "orange-pill";
    traj.attributes.forEach(attr => {
      attr.episodes.forEach(episode => {
        let sdTag = episode.startDate;
        let edTag = episode.endDate;
        
        // S'il n'y a pas de date de début, chercher dans l'attribut parent (dépendance)
        if (!sdTag && attr.dependsOn) {
            const parentAttr = traj.attributes.find(a => a.id === attr.dependsOn);
            if (parentAttr) {
                const parentEp = parentAttr.episodes.find(e => e.startDate);
                if (parentEp) sdTag = parentEp.startDate;
            }
        }
        // Même logique pour la date de fin
        if (!edTag && attr.dependsOn) {
            const parentAttr = traj.attributes.find(a => a.id === attr.dependsOn);
            if (parentAttr) {
                const parentEp = parentAttr.episodes.find(e => e.endDate);
                if (parentEp) edTag = parentEp.endDate;
            }
        }
        
        // Si toujours pas de date de début, prendre l'année de naissance par défaut (Ex: pour la première commune)
        if (!sdTag) {
            sdTag = "annee_naissance";
        }

        const startNodes = sdTag ? xmlDoc.getElementsByTagName(sdTag) : [];
        const endNodes = edTag ? xmlDoc.getElementsByTagName(edTag) : [];
        const valueNodes = episode.value ? xmlDoc.getElementsByTagName(episode.value) : [];

        const maxLen = Math.max(startNodes.length, endNodes.length, valueNodes.length);

        for (let i = 0; i < maxLen; i++) {
            // Ignorer les nœuds template de KoboToolbox
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
            if (isTemplate) continue;

            let sNode = startNodes[i] || (startNodes.length === 1 ? startNodes[0] : null);
            let eNode = endNodes[i] || (endNodes.length === 1 ? endNodes[0] : null);
            let vNode = valueNodes[i] || (valueNodes.length === 1 ? valueNodes[0] : null);

            let startVal = sNode ? sNode.textContent : null;
            let endVal = eNode ? eNode.textContent : null;
            const val = vNode ? vNode.textContent : null;

            // Traitement intelligent : Si l'utilisateur tape directement un âge (ex: 20) dans le champ Année/Date
            if (startVal && startVal.trim() !== "" && birthYearStr) {
                let parsedVal = parseInt(startVal.trim(), 10);
                if (!isNaN(parsedVal) && parsedVal >= 0 && parsedVal <= 120) {
                    startVal = (parseInt(birthYearStr, 10) + parsedVal).toString();
                }
            }
            if (endVal && endVal.trim() !== "" && birthYearStr) {
                let parsedVal = parseInt(endVal.trim(), 10);
                if (!isNaN(parsedVal) && parsedVal >= 0 && parsedVal <= 120) {
                    endVal = (parseInt(birthYearStr, 10) + parsedVal).toString();
                }
            }

            // Fallback : Trouver l'année de début via les champs annee_* ou age_* si startVal est vide
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
                            } else if (tag.includes("age") && !tag.includes("depart") && !tag.includes("fin") && !tag.includes("term")) {
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

            // Fallback : Trouver l'année de fin via les champs annee_* ou age_* si endVal est vide
            if ((!endVal || endVal.trim() === "") && vNode) {
                let parent = vNode.parentNode;
                if (parent) {
                    let children = Array.from(parent.childNodes).filter(c => c.nodeType === 1);
                    for (let child of children) {
                        let tag = child.tagName.toLowerCase();
                        let text = child.textContent ? child.textContent.trim() : "";
                        if (text && (!edTag || tag !== edTag.toLowerCase())) {
                            if ((tag.includes("annee") || tag.includes("date")) && (tag.includes("depart") || tag.includes("fin") || tag.includes("term"))) {
                                endVal = text;
                                break;
                            } else if (tag.includes("age") && (tag.includes("depart") || tag.includes("fin") || tag.includes("term"))) {
                                if (birthYearStr) {
                                    let age = parseInt(text, 10);
                                    if (!isNaN(age)) {
                                        endVal = (parseInt(birthYearStr, 10) + age).toString();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (!startVal || startVal.trim() === "") {
                continue; // Impossible de dessiner sur la timeline sans date de début
            }

            let contentVal = val;
            // Si val est vide, essayer de récupérer depuis status
            if ((!contentVal || contentVal.trim() === "") && episode.status) {
                const statusNodes = xmlDoc.getElementsByTagName(episode.status);
                const statNode = statusNodes[i] || (statusNodes.length === 1 ? statusNodes[0] : null);
                if (statNode) contentVal = statNode.textContent;
            }

            // Fallback contenu : Si le champ principal est vide, chercher dans les nœuds du même groupe
            if ((!contentVal || contentVal.trim() === "") && vNode) {
                let parent = vNode.parentNode;
                if (parent) {
                    let children = Array.from(parent.childNodes).filter(c => c.nodeType === 1);
                    for (let child of children) {
                        let tag = child.tagName.toLowerCase();
                        let text = child.textContent ? child.textContent.trim() : "";
                        let isDateOrAge = tag.includes("annee") || tag.includes("age") || tag.includes("date") || tag.includes("note");
                        let isExactDateTag = (sdTag && tag === sdTag.toLowerCase()) || (edTag && tag === edTag.toLowerCase());
                        let isDescriptorOrId = tag.startsWith("d_") || tag.startsWith("id_"); // Exclure les codes automatiques comme 250 (Pays France)
                        
                        if (text && !isDateOrAge && !isExactDateTag && !isDescriptorOrId) {
                            contentVal = text; // Prendre temporairement cette valeur
                            // Si la balise semble être une question ou une valeur principale, l'utiliser en priorité
                            if (tag.includes("q_") || tag.includes("v_") || tag.includes("list") || tag.includes("nom") || tag.includes("commune")) {
                                break;
                            }
                        }
                    }
                }
            }

            // Si le champ value est défini mais vide (et aucun fallback trouvé), on ignore
            if ((!contentVal || contentVal.trim() === "") && episode.value !== null) {
                continue;
            }

            // Fallback du contenu s'il n'y a absolument rien
            if (!contentVal || contentVal.trim() === "") {
                contentVal = episode.id;
            }

            let start = new Date(startVal);
            if (!isNaN(start.getTime())) {
              const item = {
                id: itemId++,
                group: attr.id,
                content: contentVal,
                start: start,
                className: trajColorClass
              };
              
              if (endVal && endVal.trim() !== "") {
                 const end = new Date(endVal);
                 if (!isNaN(end.getTime())) {
                   item.end = end;
                 }
              }
              newItems.push(item);
            }
        }
      });
    });
  });

  // ÉTAPE POST-PROCESSING : Chaîner les événements consécutifs pour créer des blocs continus (ranges)
  // Regrouper les éléments par groupe (ex: A_commune, A_logement,...)
  const itemsByGroup = {};
  newItems.forEach(item => {
      if (!itemsByGroup[item.group]) itemsByGroup[item.group] = [];
      itemsByGroup[item.group].push(item);
  });

  // Pour chaque groupe, trier par date de début et lier la date de fin à la date de début de l'événement suivant
  for (let groupId in itemsByGroup) {
      let groupItems = itemsByGroup[groupId];
      groupItems.sort((a, b) => a.start.getTime() - b.start.getTime());

      for (let i = 0; i < groupItems.length; i++) {
          let current = groupItems[i];
          if (!current.end) {
              if (i < groupItems.length - 1) {
                  // Étendre jusqu'au début de l'événement suivant
                  current.end = groupItems[i + 1].start;
              } else {
                  // Le dernier événement s'étend jusqu'à aujourd'hui
                  current.end = new Date();
              }
          }
      }
  }

  items.clear();
  items.add(newItems);
  
  // Déclencher la logique de temps personnalisé pour mettre à jour la Synthèse
  const customTime = timeline.getCustomTime(customTimeId);
  timeline.setCustomTime(customTime, customTimeId);
}

// Mise à jour initiale
updateTimeline();

// Écouter tous les événements de saisie du formulaire
formEl.addEventListener('change', () => {
  updateTimeline();
});
formEl.addEventListener('input', () => {
  updateTimeline();
});
