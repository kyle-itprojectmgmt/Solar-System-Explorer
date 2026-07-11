# Solar System Explorer — Landing Page Project
# Paste this entire message to start a new Claude chat focused on the landing page.
# Keep this chat separate from the simulator build chat.

---

## PROJECT CONTEXT

I am Kyle Ewing — IT Project Manager, MBA, PMP.
Website: itprojectmgmt.com
Email: kyle@itprojectmgmt.com
Location: Chicago / Nationwide / Remote

I have built a photorealistic, first-person 3D Jupiter System
Simulator using Claude AI and Fable (Claude Code) in approximately
48 hours. It is live at:
https://solar-system-explorer.kyle-d06.workers.dev

The simulator is built with Three.js + Vite, hosted on Cloudflare
Workers. The GitHub repository is:
https://github.com/kyle-itprojectmgmt/Solar-System-Explorer

This project is a live demonstration of the principles in my book:
"The Doodle Principle: How AI Becomes Your Partner in Curiosity
and Creativity"

---

## WHAT WE ARE BUILDING

A professional landing page website to accompany the simulator.
The landing page will:

1. Introduce the simulator (product landing page)
2. Tell the story of how it was built with AI (tutorial/case study)
3. Build awareness for me and my book
4. Serve as content for LinkedIn, YouTube, Substack, Instagram,
   and other social media about Claude, AI, vibe coding, and
   what's possible with AI tools

The landing page is a SEPARATE site from the simulator.
The simulator launches in a new tab when clicked.

---

## TECHNICAL ARCHITECTURE

### Hosting
Same Cloudflare Worker as the simulator.
The Worker already serves the simulator at the root URL.
We will add routing so:
  /           → landing page (new default)
  /explore    → the simulator (moved from root)
  /story      → how I built it page
  /book       → The Doodle Principle page

OR alternatively, a completely separate domain/deployment.
Let's discuss the best approach at the start of our session.

### Tech Stack for Landing Page
- Pure HTML + CSS + minimal vanilla JavaScript
- No framework — fast loading, SEO-friendly, easy to maintain
- Reuse existing brand: Montserrat (headings) + Lato (body)
- Reuse existing color palette (see Brand section below)
- Mobile responsive
- One HTML file per page (about, story, book) or single-page
  with anchor sections — let's decide together

### Brand / Style Guide
Typography:
  Headings: Montserrat (Google Fonts)
  Body: Lato (Google Fonts)

Colors:
  Primary Blue:      #0077CC
  Light Blue Accent: #66B2FF
  White:             #FFFFFF
  Light Gray:        #D9D9D9
  Dark Gray:         #4D4D4D
  Space Black:       #050510

The landing page should feel connected to the simulator visually
but also stand alone as a professional project showcase page.
Space-themed but professional — not gimmicky.

---

## PAGE STRUCTURE

### Navigation Bar (sticky, all pages)
Logo/Title: "Solar System Explorer"
Links: About | How I Built It | The Book | [Launch Explorer ▶]
The "Launch Explorer" button opens the simulator in a new tab.
Mobile: hamburger menu.

### Page 1 — Landing / About (/  or /about)

HERO SECTION:
- Full-width dramatic screenshot of the simulator as background
  (Jupiter cinematic view or GeoSync cloud bands)
- Overlay headline: "Explore the Jupiter System"
- Subhead: "A photorealistic, first-person space explorer.
  Built with AI. No download required."
- Two CTA buttons:
  [Launch Explorer ▶] opens simulator in new tab
  [How I Built It] scrolls to or links to story

WHAT IT IS (3 columns with screenshots):
- First-person probe perspective — see Jupiter as Voyager saw it
- Accurate physics + procedural detail — zoom into cloud bands
- Free to explore — 7 camera modes, 9 moons, real orbital mechanics

INLINE PREVIEW:
- Large simulator screenshot with a ▶ play button overlay
- Clicking launches the simulator in a new tab
  (or optionally embeds it as an iframe)
- Caption: "Click to explore — works in any browser, no install"

THE NUMBERS (impact stats):
- Built in ~48 hours
- 12+ camera modes
- 9 moons simulated
- 5 procedural detail shaders
- $0 in hosting costs
- 1 AI partner (Claude)

THE BOOK (transition section):
- "This project is a live demonstration of the principles in:"
- Book cover image (Kyle to provide)
- Title: "The Doodle Principle: How AI Becomes Your Partner
  in Curiosity and Creativity"
- 2-3 sentence description (Kyle to provide)
- [Learn More] [Buy Now] buttons

ABOUT KYLE:
- Photo (Kyle to provide, or skip for now)
- Name, credentials: Kyle Ewing, MBA, PMP
- 2-3 sentence bio (Kyle to provide)
- Links: ITprojectMGMT.com | LinkedIn | YouTube |
         Substack | Instagram | GitHub

FOOTER:
- © 2026 Kyle Ewing
- Links: Legal & Disclaimer | Privacy Policy | Contact
- NASA texture credits (Solar System Scope CC BY 4.0,
  USGS/Steve Albers, Björn Jónsson)
- "Built with Claude AI"
- Ko-fi support link

### Page 2 — How I Built It (/story)

INTRO:
- Title: "How I Built a Photorealistic Space Simulator
  with AI in 48 Hours"
- Subtitle: "A complete case study in AI-assisted development —
  including every prompt I used"

THE IDEA:
- How the concept formed
- Why Jupiter
- What I wanted to achieve
- Kyle to provide this content

THE TOOLS:
- Claude / Fable (Claude Code)
- Three.js + Vite
- Cloudflare Workers + R2
- NASA public domain textures
- Brief explanation of each and why chosen

THE PROCESS (timeline / milestones):
- v1: Core Jupiter system, 6 camera modes, physics, audio
- v2: Bug fixes, orbit insertion, altitude control
- v3: Procedural detail shaders (infinite resolution zoom)
- v3b: Orbit surface movement — surface sweeps beneath camera
- v4: Sharpness pass, UI polish, body cards, tooltips

THE PROMPTS (this is the unique educational content):
- Show excerpts from actual prompt files used
- Explain the prompt engineering approach
- Key insight: prompts as architectural specifications,
  not just instructions
- Link to GitHub repo where full prompts are available

THE CHALLENGES:
- Source code never committed (lost work, recovered)
- The 21-module Vite build mystery
- GeoSync drift — the elegant fix
- Oval Jupiter and how it was diagnosed
- Honest about what went wrong and how AI helped fix it

THE RESULTS:
- Screenshots at each version (v1 through v4)
- Performance: 60fps desktop, 30fps mobile
- Cost: $5/month Cloudflare plan
- Hosting: unlimited bandwidth, zero egress fees

WHAT'S NEXT:
- Earth + Moon system (with ISS live position)
- Saturn with real particle rings
- Full solar system navigation
- The project continues...

CALL TO ACTION:
- [Launch the Simulator]
- [Read The Doodle Principle]
- [Follow on LinkedIn] [Subscribe on Substack]

### Page 3 — The Book (/book)

HERO:
- Book cover (Kyle to provide)
- Title and subtitle
- "The book that made this project possible"

ABOUT THE BOOK:
- What is The Doodle Principle
- Core premise: AI as creative partner in curiosity
- How this simulator demonstrates the principles
- Kyle to provide description

CONNECTION TO THIS PROJECT:
- This simulator is chapter [X] come to life
- The prompts we used embody the doodle principle
- Curiosity-driven development with AI as partner

BUY / LEARN MORE:
- [Buy on Amazon] or wherever it's sold
- [Preview / Learn More]

AUTHOR:
- Kyle Ewing bio
- ITprojectMGMT.com
- Social links

---

## CONTENT I NEED FROM KYLE

Before Claude Code can build the pages, Kyle needs to provide:

[ ] Hero headline (your words — what is the simulator to you?)
[ ] 2-3 sentence project description in your voice
[ ] Your story — how/why you built this (can be bullet points,
    Claude will help write it up)
[ ] Book description — title, subtitle, what it's about, buy link
[ ] Your bio — 2-3 sentences
[ ] Photo (optional for first version)
[ ] Social media URLs:
    LinkedIn: 
    YouTube:  
    Substack: 
    Instagram:
    GitHub:   https://github.com/kyle-itprojectmgmt
[ ] Ko-fi URL: https://ko-fi.com/YOUR_HANDLE
[ ] Book buy link:
[ ] Book cover image file

Screenshots of the simulator — use these key moments:
1. Cinematic Jupiter view with rings (system wide)
2. GeoSync orbit — cloud bands below camera
3. Europa ice cracks at 500km altitude
4. Surface view from Io with Jupiter on horizon
5. System view showing all moons + orbital paths
6. Orbit insertion panel with HUD data visible

---

## WHAT I WANT FROM THIS CHAT

1. Help me think through the content and structure
2. Help me write the copy (headlines, feature descriptions,
   story narrative) — my voice, your craft
3. Produce ready-to-deploy HTML/CSS files for each page
4. Advise on the routing architecture (landing page vs simulator
   at root URL, same Worker vs separate deployment)
5. Create a prompt file for Claude Code to build the pages
   once content is finalized

Let's start by discussing the routing architecture and
then work on content before writing any code.

---

## LINKS AND REFERENCES

Live simulator:
https://solar-system-explorer.kyle-d06.workers.dev

GitHub repository:
https://github.com/kyle-itprojectmgmt/Solar-System-Explorer

My professional website:
https://itprojectmgmt.com

The Doodle Principle: (add link when available)

Brand colors and typography match ITprojectMGMT.com:
Blue #0077CC, Light Blue #66B2FF, Montserrat + Lato
