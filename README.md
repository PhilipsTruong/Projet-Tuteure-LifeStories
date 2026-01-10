# Life Stories: Interactive Biographical Survey Tool

## 📖 About The Project
**Life Stories** is a research initiative aiming to modernize biographical data collection (life trajectories) for social sciences. Traditionally done via paper, this project provides a robust digital solution for collecting longitudinal data (migration, employment, housing history).

This repository hosts the development of a **generic bridge** between standard survey tools and an interactive visualization interface.

## 👥 Contributors & Supervision
* **Development Team:** Tran Phuc Tin Truong, Adrien Van-Robays.
* **Supervision:** Marlène Villanova (Professor), Benjamin Fontaine (PhD Candidate).

## 🎯 Key Objectives
The main goal of this phase is to move from a static prototype to a **generic, configurable tool** by integrating **KoboToolbox** (based on Enketo).

## 🛠️ Technical Stack & Architecture
* **Survey Engine:** KoboToolbox / Enketo (Open source form engine).
* **Data Format:** XML / JSON / XLSForm standards.
* **Core Logic:** Custom parser to translate Survey Logic $\leftrightarrow$ Visualization Objects.
* **Target Environment:** Offline-first architecture (Tablets) for field research in low-connectivity areas.

## 🚀 Key Features
* **Dual-Interface System:**
    * *Interviewer View:* Form-based input with full control.
    * *Respondent View:* Read-only interactive timeline to aid memory recall.
* **Error Detection:** visually highlights gaps or overlaps in the life trajectory (e.g., two jobs at the same time).
* **"Lego" Mode:** Allows manual insertion of forgotten events directly onto the timeline.

---
*This project is part of the "Life Stories" research initiative.*
