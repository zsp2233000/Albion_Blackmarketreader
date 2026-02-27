# Refining Calculator

## Projektziel
Der Refining Calculator berechnet fuer Refining-Varianten Kosten, Output, Profit und Profit-Prozent auf Basis von Materialpreisen, Steuern und Bonus-Konfiguration.

## Setup
- `npm install`
- `npm run dev`
- `npm run test`

## Architektur
Functional Core / Imperative Shell:
- `core/`: pure Berechnungsfunktionen ohne Side Effects
- `ui/`: React-Komponenten, Zustand, Events, Auth/UI-Interaktion
- `data/`: statische Variant-/Default-Daten
- `tests/`: Vitest fuer Core-Logik

## FP-Entscheidungen
- Pure Functions: `calculateRefining`, `applyBonuses`, `computeReturnRate`, `computeProfit`
- Immutability: neue Objekte statt Mutation, Readonly-Inputs in Core
- Composition: Pipeline mit `pipe(...)` in `calculateRefining`
- Closures: `makeRefiner(config) => (variant, tierInputs, taxRate) => result`
- HOF: `withBonus(...)` kapselt Bonus-Schritt in der Pipeline

## Funktionalitaet
- Material-Input ueber Tier-Preise (alle Materialfamilien: Metal, Wood, Fiber, Hide; T4-T8)
- Alle Refining-Varianten fuer T4-T8 und Enchant 0-4 sind enthalten
- City-/Refining-Bonus und Focus an/aus (RRR-Profile: 15.2 / 36.7 / 53.9)
- Stationsgebuehr ueber `UsageFeePer100`
- Live-Daten vorbereitet:
  - `public/data/materials-cities-{region}.json` fuer Marktpreise je Variante (city-spezifisch)
  - `public/data/materials-cities-{region}.json` fuer Tier-Basispreise (city-spezifisch)
- Output:
  - Gesamtkosten (`totalCost`)
  - Output-Menge (`outputAmount`, aktuell 1 pro Cycle)
  - Gewinn/Verlust (`profit`)
  - Profit % (`profitPercent`)

## Kernformeln
- `nutritionCost = itemValue * nutritionFactor` (Default `0.1125`)
- `stationFee = (usageFeePer100 / 100) * nutritionCost`
- `effectiveMaterialCost = grossMaterialCost * (1 - returnRate)`
- `totalCost = effectiveMaterialCost + stationFee`
- `profit = revenue - totalCost`

## Testing
Die Tests pruefen:
- deterministische Berechnung (gleiches Input => gleiches Output)
- Bonus-Anwendung
- Return-Rate mit/ohne Focus
- Profit inkl. Negativfall
- Immutability (Input/State wird nicht mutiert)
- komplette Kompositions-Pipeline ueber den Closure-Builder `makeRefiner`
