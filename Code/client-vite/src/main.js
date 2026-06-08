import { Form } from 'enketo-core';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import Split from 'split.js';

// Setup Layout
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

// --- Bắt đầu phần tích hợp Timeline nâng cao ---
const container = document.getElementById('timeline');
const items = new DataSet();
const groups = new DataSet();

// Hàm format tên nhóm để xoá các tiền tố A_, T_ và viết hoa chữ cái đầu
function formatLabel(id) {
    let formatted = id.replace(/^[A-Z]_/i, '');
    formatted = formatted.replace(/_/g, ' ');
    return formatted.replace(/\b\w/g, l => l.toUpperCase());
}

// Trajectory to color map
const colorMap = ["orange-pill", "blue-pill", "green-pill", "yellow-pill"];
const trajColors = {};

semanticModel.trajectories.forEach((traj, index) => {
  trajColors[traj.id] = colorMap[index % colorMap.length];
  // Tạo nhóm cha (Quỹ đạo)
  groups.add({ id: traj.id, content: `<div class="group-title">${formatLabel(traj.id)}</div>`, showNested: true });
  // Tạo các nhóm con (Thuộc tính)
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

// Custom Vertical Time Bar logic
const stepSize = 1000 * 60 * 60 * 24; // 1 day
let customTimeId = timeline.addCustomTime(new Date(new Date().setFullYear(new Date().getFullYear() - 1)), "custom-bar");

timeline.on("timechange", function (event) {
  var selectedTime = event.time.getTime();
  var snappedTime = Math.round(selectedTime / stepSize) * stepSize;
  timeline.setCustomTime(new Date(snappedTime), customTimeId);

  // Reset highlights
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
      
      // Clean up the nested group name using formatLabel (if we want the Synthèse card to also look clean)
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

  // Cập nhật giới hạn của timeline dựa trên năm sinh (annee_naissance)
  let birthYearStr = null;
  const anneeNaissanceNodes = xmlDoc.getElementsByTagName("annee_naissance");
  if (anneeNaissanceNodes.length > 0 && anneeNaissanceNodes[0].textContent) {
      birthYearStr = anneeNaissanceNodes[0].textContent;
      const annee = parseInt(birthYearStr, 10);
      if (!isNaN(annee)) {
          let opts = { 
              min: new Date(annee - 5, 0, 1), // Nới lỏng min lùi lại 5 năm để người dùng có khoảng trống kéo
              max: new Date(new Date().getFullYear() + 5, 0, 1) // Ngăn kéo xa quá hiện tại
          };
          
          // Tự động scale view để nhìn bao quát toàn bộ cuộc đời nếu nhập xong 4 số
          if (birthYearStr.length >= 4 && annee > 1900 && annee <= new Date().getFullYear()) {
              if (!window.hasAutoZoomedToLifespan) {
                  opts.start = new Date(annee - 2, 0, 1);
                  opts.end = new Date(new Date().getFullYear() + 1, 0, 1);
                  window.hasAutoZoomedToLifespan = true;
              }
          } else {
              window.hasAutoZoomedToLifespan = false; // Reset nếu họ xoá đi nhập lại
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
        
        // Nếu không có ngày bắt đầu, tìm từ attribute cha (phụ thuộc)
        if (!sdTag && attr.dependsOn) {
            const parentAttr = traj.attributes.find(a => a.id === attr.dependsOn);
            if (parentAttr) {
                const parentEp = parentAttr.episodes.find(e => e.startDate);
                if (parentEp) sdTag = parentEp.startDate;
            }
        }
        // Tương tự cho ngày kết thúc
        if (!edTag && attr.dependsOn) {
            const parentAttr = traj.attributes.find(a => a.id === attr.dependsOn);
            if (parentAttr) {
                const parentEp = parentAttr.episodes.find(e => e.endDate);
                if (parentEp) edTag = parentEp.endDate;
            }
        }
        
        // Nếu vẫn không có ngày bắt đầu, mặc định lấy năm sinh (Ví dụ cho commune đầu tiên)
        if (!sdTag) {
            sdTag = "annee_naissance";
        }

        const startNodes = sdTag ? xmlDoc.getElementsByTagName(sdTag) : [];
        const endNodes = edTag ? xmlDoc.getElementsByTagName(edTag) : [];
        const valueNodes = episode.value ? xmlDoc.getElementsByTagName(episode.value) : [];

        const maxLen = Math.max(startNodes.length, endNodes.length, valueNodes.length);

        for (let i = 0; i < maxLen; i++) {
            // Bỏ qua các node template của KoboToolbox
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

            // Fallback: Tìm năm bắt đầu từ các trường annee_* hoặc age_* nếu startVal rỗng
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

            // Fallback: Tìm năm kết thúc từ các trường annee_* hoặc age_* nếu endVal rỗng
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
                continue; // Không thể vẽ lên timeline nếu thiếu ngày bắt đầu
            }

            let contentVal = val;
            // Nếu val rỗng, thử lấy từ status
            if ((!contentVal || contentVal.trim() === "") && episode.status) {
                const statusNodes = xmlDoc.getElementsByTagName(episode.status);
                const statNode = statusNodes[i] || (statusNodes.length === 1 ? statusNodes[0] : null);
                if (statNode) contentVal = statNode.textContent;
            }

            // Fallback content: Nếu field chính rỗng, thử tìm trong các node cùng group
            if ((!contentVal || contentVal.trim() === "") && vNode) {
                let parent = vNode.parentNode;
                if (parent) {
                    let children = Array.from(parent.childNodes).filter(c => c.nodeType === 1);
                    for (let child of children) {
                        let tag = child.tagName.toLowerCase();
                        let text = child.textContent ? child.textContent.trim() : "";
                        let isDateOrAge = tag.includes("annee") || tag.includes("age") || tag.includes("date") || tag.includes("note");
                        let isExactDateTag = (sdTag && tag === sdTag.toLowerCase()) || (edTag && tag === edTag.toLowerCase());
                        let isDescriptorOrId = tag.startsWith("d_") || tag.startsWith("id_"); // Loại bỏ các mã code tự động như 250 (Quốc gia Pháp)
                        
                        if (text && !isDateOrAge && !isExactDateTag && !isDescriptorOrId) {
                            contentVal = text; // Lấy tạm giá trị này
                            // Nếu tag có vẻ là câu hỏi hoặc giá trị chính, ưu tiên dùng luôn
                            if (tag.includes("q_") || tag.includes("v_") || tag.includes("list") || tag.includes("nom") || tag.includes("commune")) {
                                break;
                            }
                        }
                    }
                }
            }

            // Nếu field value được định nghĩa nhưng người dùng chưa nhập gì (và fallback cũng không tìm thấy) thì bỏ qua
            if ((!contentVal || contentVal.trim() === "") && episode.value !== null) {
                continue;
            }

            // Fallback content nếu không có gì cả
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

  // BƯỚC POST-PROCESSING: Nối đuôi các sự kiện liên tiếp để tạo thành block kéo dài (range)
  // Nhóm các item theo group (ví dụ: A_commune, A_logement,...)
  const itemsByGroup = {};
  newItems.forEach(item => {
      if (!itemsByGroup[item.group]) itemsByGroup[item.group] = [];
      itemsByGroup[item.group].push(item);
  });

  // Với mỗi group, sắp xếp theo ngày bắt đầu và nối end date vào start date của sự kiện tiếp theo
  for (let groupId in itemsByGroup) {
      let groupItems = itemsByGroup[groupId];
      groupItems.sort((a, b) => a.start.getTime() - b.start.getTime());

      for (let i = 0; i < groupItems.length; i++) {
          let current = groupItems[i];
          if (!current.end) {
              if (i < groupItems.length - 1) {
                  // Kéo dài đến khi sự kiện tiếp theo bắt đầu
                  current.end = groupItems[i + 1].start;
              } else {
                  // Sự kiện cuối cùng kéo dài đến hiện tại
                  current.end = new Date();
              }
          }
      }
  }

  items.clear();
  items.add(newItems);
  
  // Trigger custom time logic to update Synthèse if items appeared under the bar
  const customTime = timeline.getCustomTime(customTimeId);
  timeline.setCustomTime(customTime, customTimeId);
}

// Initial update
updateTimeline();

// Lắng nghe tất cả sự kiện nhập liệu từ form
formEl.addEventListener('change', () => {
  updateTimeline();
});
formEl.addEventListener('input', () => {
  updateTimeline();
});

