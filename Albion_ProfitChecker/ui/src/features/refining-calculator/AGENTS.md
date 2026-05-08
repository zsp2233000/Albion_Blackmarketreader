# Refining Calculator: Codex Rules (Full Score Target)

Dieses File ist bindend fuer alle Aenderungen im `refining-calculator`-Feature.
Ziel: alle Rubrikpunkte mit **3/3** erreichen.

## 1. Pflicht-Architektur

Verwende strikt:

- `src/features/refining-calculator/core/` nur funktionale Logik (pure functions, keine Side Effects)
- `src/features/refining-calculator/ui/` nur React-Komponenten (imperative shell)
- `src/features/refining-calculator/data/` statische Daten (JSON/TS-Constants)
- `src/features/refining-calculator/tests/` Vitest-Tests fuer Core

UI darf niemals Business-Logik berechnen, nur Core-Funktionen aufrufen.

## 2. Core FP Concepts (A)

### A1) Pure Functions / No Side Effects

Pflichtfunktionen in `core/`:

- `calculateRefining(input) -> output`
- `applyBonuses(state, bonuses) -> state`
- `computeReturnRate(input) -> number`
- `computeProfit(cost, revenue) -> number`

Regeln:

- kein `fetch`, `localStorage`, `Date`, `Math.random`, DOM, globale Variablen
- alle Inputs explizit als Parameter
- gleicher Input => gleicher Output

### A2) Immutability

- Keine In-Place-Mutation (`push`, `splice`, Property-Reassign an bestaehenden Objekten)
- Immer neue Werte: `map`, `filter`, `reduce`, Spread
- Nutze `Readonly`/`ReadonlyArray` wo sinnvoll

### A3) Higher-Order Functions

Pflicht:

- Datenfluss ueber `map`/`reduce`/`filter`
- mindestens eine eigene HOF, z. B.:
  - `withBonus(bonusFn)`
  - `pipe(...fns)`

## 3. FP Techniques (B)

### B1) Function Composition

Nutze eine klare Pipeline:

`pipe(parseInput, computeBase, applyCityBonus, applyFocus, finalizeProfit)`

Oder:

`const steps = [step1, step2, step3]; steps.reduce(...)`

### B2) Closures

Pflicht:

- mindestens ein sinnvoller Closure-Builder, z. B.:
  - `makeRefiner(config) => (recipeInput) => result`
  - `mkCalculator(rates) => (input) => output`

### B3) Type Safety (TypeScript)

Pflicht:

- starke Typen fuer alle Core-Funktionen (kein `any`)
- Domain-Typen:
  - `City = "Bridgewatch" | "Lymhurst" | "Fort Sterling" | "Martlock" | "Thetford" | "Caerleon"`
  - `Tier = 4 | 5 | 6 | 7 | 8`
  - `Enchant = 0 | 1 | 2 | 3 | 4`
- Interfaces fuer Input/Output (`RefiningInput`, `RefiningResult`, `BonusConfig`)

## 4. Code Quality (C)

### C1) Readability & Naming

Pflicht-Namensstil:

- fachlich praezise: `refiningFee`, `returnRate`, `focusCost`, `resourceTier`, `cityBonusRate`
- kleine, fokussierte Funktionen
- keine Monster-Funktion > ca. 40-60 Zeilen ohne klaren Grund

### C2) README

Im Feature muss ein README liegen:

`src/features/refining-calculator/README.md`

Muss enthalten:

- Projektziel
- Setup (`npm install`, `npm run dev`, `npm run test`)
- Architektur: Functional Core / Imperative Shell
- FP-Entscheidungen (pure functions, immutability, composition, closures)
- Testing-Umfang und was geprueft wird

### C3) Funktionalitaet (nicht trivial)

Minimum-Funktionsumfang:

- Material-Input (Tier, Enchant, Menge)
- City- oder Refining-Bonus
- Return Rate + Focus an/aus
- Gebuehren/Steuern
- Output:
  - Gesamtkosten
  - Output-Menge
  - Gewinn/Verlust
  - Profit %

Optional fuer bessere Wirkung:

- City-Vergleich mit `bestCity`

## 5. Testpflicht (Vitest)

Erstelle Tests in `tests/` fuer:

- reine Berechnungen (deterministisch)
- Bonus-Anwendung
- Return Rate / Focus toggles
- Profit-Berechnung inkl. negativer Faelle
- Immutability-Schutz (Input bleibt unveraendert)

Mindestens ein Test soll die komplette Kompositions-Pipeline pruefen.

## 6. Nicht erlaubt

- `any` in Core (ausser begruendete Ausnahme mit Kommentar)
- Business-Logik direkt in React-Komponenten
- versteckte Seiteneffekte in Core
- mutierende State-Updates

## 7. Definition of Done (Full-Score Check)

Nur als erledigt markieren, wenn:

1. Functional Core + UI Shell sauber getrennt ist.
2. Alle Kernberechnungen pure sind.
3. Immutability in Code und Tests sichtbar ist.
4. HOF + Komposition + Closure im echten Problem genutzt werden.
5. TypeScript-Typen die Domain treiben (Union Types, klare Interfaces).
6. README vollstaendig ist.
7. Feature laeuft lokal und Tests sind gruen.
