# Complete IES Civil calendar — updated 8 October 2026

This is the current plan. It supersedes the 5 October selection in `pyq-plan.md`; the runnable calendar is `src/lib/calendar/pyq-plan-preset.json`, and `pyq-plan.csv` is its exact CSV export.

## Scope and evidence

All **106 unique Civil technical tests / 4,414 questions** from the IES My Tests snapshot of 4 October are now scheduled once. The original 59 first attempts, 72 short revision passes for 36 priority tests, 10 mocks (the last optional), reasoning blocks and Made Easy subject tests are unchanged. This update adds **47 tests / 1,019 questions / 672 attempt minutes** and **13 review blocks / 349 minutes**. Review is budgeted as half each added test's timer, rounded up; it is an estimate, not a portal timer.

The original selection skipped 27 low-frequency tests, 19 tests not explicitly named in the notice mapping, and T86 for lack of room. That blanket exclusion conflicted with `hot-topics.md`, which specifically recommends hydraulic machines, contouring, paints and curves based on historical appearances. Those four plus T86 receive preferred early slots. Full coverage does not mean every test is equally valuable: T9, T10, T25, T33, T41, T55, T64, T65, T75, T78 and T89 carry an Optional note and are the first to skip if behind. Topic tags and historical frequencies are imperfect; this is a coverage plan, not a forecast or a new official syllabus determination.

## Scheduling rules

- All additions are on 8–26 October; no new technical tests on full-mock days or during the final review period from 28 October.
- The existing 14 and 21 October review blocks stay intact; those days also receive new tests, like the original 7 and 21 October catch-up days.
- Use the exact saved portal name to locate each test. Portal names are preserved even where the portal has a typo. T41's portal title unusually omits the test number at the start.
- IES allows one full attempt. The separate review blocks use Report to redo wrong, guessed and slow questions; they are not second submissions.
- Original schedules and saved progress are never replaced with guessed completion. Overdue original rows remain overdue. The plan does not automatically claim to know tests completed since the portal snapshot.
- Updated built-in version is 2026-10-08. An existing browser shows Update now / Update PYQ plan; the update adds future tests and review blocks and preserves attempted/skipped/opened states, notes and custom links. New browsers load the expanded preset. Progress remains device-local.

## Workload

This is an intensive full-coverage option. Added attempts and their explicit review require **17 hours 1 minute** across 13 study days. The table's calendar total includes the new review blocks but, like the old preset, does not contain a separate row for the original first-attempt review allowance. The final column adds about 50% of those original technical attempt times. The expanded days need **435–440 minutes (about 7¼ hours)** before breaks or additional concept teaching. This estimate excludes accumulated backlog. If less time is available, skip the Optional breadth tests first and protect mock analysis and high-priority error repair.

## Added technical tests by day

| Date | Added test numbers | Attempt min | Added review min | Calendar min | Including original technical review min |
|---|---|---:|---:|---:|---:|
| 2026-10-08 | T105, T102, T24, T25, T75 | 46 | 24 | 364 | 439 |
| 2026-10-10 | T93, T33, T58 | 32 | 17 | 341 | 440 |
| 2026-10-11 | T78, T65 | 10 | 6 | 328 | 437 |
| 2026-10-13 | T41, T6, T89, T15 | 50 | 26 | 366 | 439 |
| 2026-10-14 | T53, T69, T32, T55 | 102 | 52 | 439 | 439 |
| 2026-10-15 | T80, T40 | 47 | 24 | 364 | 438 |
| 2026-10-17 | T86, T3, T16, T46, T84 | 81 | 42 | 364 | 437 |
| 2026-10-18 | T82, T76 | 16 | 9 | 331 | 437 |
| 2026-10-19 | T61, T63, T43, T62, T9 | 60 | 32 | 362 | 435 |
| 2026-10-21 | T26, T95, T7, T73 | 90 | 46 | 420 | 435 |
| 2026-10-22 | T23, T10, T64 | 27 | 14 | 363 | 437 |
| 2026-10-24 | T94, T103, T14, T47, T74 | 62 | 32 | 372 | 439 |
| 2026-10-26 | T12, T59, T13 | 49 | 25 | 363 | 435 |

## Complete technical index

Each row is one full first attempt. Existing Pass 2 / Pass 3 entries are excluded from this count.

| Test | Topic | Date | Questions | Portal timer min | Priority note |
|---|---|---|---:|---:|---|
| T1 | Strength of Materials | 2026-10-19 | 136 | 90 | Scheduled |
| T2 | Shear Force and Bending Moment | 2026-10-18 | 60 | 40 | Scheduled |
| T3 | Deflection of Beams | 2026-10-17 | 32 | 25 | Scheduled |
| T4 | Transformation of Stress and Strain | 2026-10-13 | 26 | 18 | Scheduled |
| T5 | Bending Stress in Beams | 2026-10-18 | 34 | 22 | Scheduled |
| T6 | Shear Stress in Beams | 2026-10-13 | 22 | 15 | Scheduled |
| T7 | Torsion of Circular Shafts | 2026-10-21 | 23 | 16 | Scheduled |
| T8 | Columns | 2026-10-18 | 35 | 25 | Scheduled |
| T9 | Springs | 2026-10-19 | 10 | 7 | Optional breadth |
| T10 | Thick and Thin Cylinders | 2026-10-22 | 10 | 8 | Optional breadth |
| T11 | Moment of Inertia | 2026-10-08 | 26 | 16 | Scheduled |
| T12 | Structural Determinacy and Stability | 2026-10-26 | 43 | 27 | Scheduled |
| T13 | Statically Indeterminate Structural Analysis | 2026-10-26 | 16 | 10 | Scheduled |
| T14 | Trusses | 2026-10-24 | 29 | 18 | Scheduled |
| T15 | Influence Lines | 2026-10-13 | 6 | 4 | Scheduled |
| T16 | Arches | 2026-10-17 | 22 | 14 | Scheduled |
| T17 | Introduction of Limit State and Working Stress Methods | 2026-10-13 | 175 | 110 | Scheduled |
| T18 | Limit State of Collapse in Shear | 2026-10-13 | 27 | 17 | Scheduled |
| T19 | Bond and Anchorage | 2026-10-15 | 36 | 25 | Scheduled |
| T20 | Design of Beams | 2026-10-15 | 82 | 52 | Scheduled |
| T21 | Design of Slab | 2026-10-15 | 62 | 41 | Scheduled |
| T22 | Columns | 2026-10-15 | 45 | 30 | Scheduled |
| T23 | Footings | 2026-10-22 | 26 | 17 | Scheduled |
| T24 | Retaining Walls, Staircases, Water Tanks and Lintels | 2026-10-08 | 20 | 12 | Scheduled |
| T25 | Prestressed Concrete | 2026-10-08 | 9 | 6 | Optional breadth |
| T26 | General Design Requirements | 2026-10-21 | 55 | 35 | Scheduled |
| T27 | Connections | 2026-10-24 | 91 | 57 | Scheduled |
| T28 | Design of Tension Members | 2026-10-22 | 32 | 20 | Scheduled |
| T29 | Design of Compression Members | 2026-10-24 | 83 | 52 | Scheduled |
| T30 | Design of Beams | 2026-10-24 | 22 | 15 | Scheduled |
| T31 | Design of Plate Girders | 2026-10-24 | 12 | 9 | Scheduled |
| T32 | Plastic Analysis | 2026-10-14 | 14 | 8 | Scheduled |
| T33 | Industrial Buildings | 2026-10-10 | 13 | 10 | Optional breadth |
| T34 | Building Stones and Rocks | 2026-10-19 | 67 | 42 | Scheduled |
| T35 | Bricks and Brick Masonry | 2026-10-22 | 95 | 60 | Scheduled |
| T36 | Cement, Lime and Mortar | 2026-10-17 | 234 | 146 | Scheduled |
| T37 | Concrete | 2026-10-11 | 347 | 217 | Scheduled |
| T38 | Aggregates | 2026-10-05 | 93 | 60 | Scheduled |
| T39 | Timber and Wood Based Product | 2026-10-05 | 62 | 40 | Scheduled |
| T40 | Paints and Varnishes | 2026-10-15 | 31 | 20 | Scheduled |
| T41 | Bituminous Materials and Miscellaneous | 2026-10-13 | 41 | 26 | Optional breadth |
| T42 | Estimating, Costing and Valuation | 2026-10-10 | 315 | 197 | Scheduled |
| T43 | Water Demand, Sources and Conveyance | 2026-10-19 | 23 | 18 | Scheduled |
| T44 | Quality Parameters of Water | 2026-10-07 | 26 | 18 | Scheduled |
| T45 | Treatment of Water | 2026-10-08 | 44 | 30 | Scheduled |
| T46 | Water Distribution System | 2026-10-17 | 11 | 7 | Scheduled |
| T47 | Wastewater Characteristics | 2026-10-24 | 15 | 10 | Scheduled |
| T48 | Biochemical Reactions in Treatment of Waste Water | 2026-10-07 | 8 | 5 | Scheduled |
| T49 | Design of Sewerage System and Sewer Appurtenances | 2026-10-26 | 33 | 22 | Scheduled |
| T50 | Sewage Treatment | 2026-10-08 | 29 | 20 | Scheduled |
| T51 | Solid Waste Management | 2026-10-07 | 14 | 9 | Scheduled |
| T52 | Air Pollution | 2026-10-22 | 27 | 17 | Scheduled |
| T53 | Soil Phase and Water Relationships | 2026-10-14 | 120 | 76 | Scheduled |
| T54 | Classification of Soil | 2026-10-07 | 31 | 22 | Scheduled |
| T55 | Clay Minerals and Soil Structure | 2026-10-14 | 4 | 3 | Optional breadth |
| T56 | Soil Compaction | 2026-10-18 | 15 | 10 | Scheduled |
| T57 | Effective Stress, Capillarity and Permeability | 2026-10-19 | 20 | 13 | Scheduled |
| T58 | Seepage through Soil | 2026-10-10 | 7 | 5 | Scheduled |
| T59 | Compressibility and Consolidation | 2026-10-26 | 18 | 12 | Scheduled |
| T60 | Shear Strength of Soil | 2026-10-18 | 30 | 19 | Scheduled |
| T61 | Earth Pressure and Retaining Walls | 2026-10-19 | 20 | 13 | Scheduled |
| T62 | Shallow Foundation | 2026-10-19 | 24 | 15 | Scheduled |
| T63 | Deep Foundation | 2026-10-19 | 10 | 7 | Scheduled |
| T64 | Soil Exploration | 2026-10-22 | 2 | 2 | Optional breadth |
| T65 | Expansive Soils | 2026-10-11 | 1 | 1 | Optional breadth |
| T66 | Fluid Properties | 2026-10-18 | 77 | 50 | Scheduled |
| T67 | Hydrostatic Pressure | 2026-10-26 | 51 | 33 | Scheduled |
| T68 | Liquid in Relative Equilibrium | 2026-10-26 | 3 | 2 | Scheduled |
| T69 | Buoyancy and Floatation | 2026-10-14 | 24 | 15 | Scheduled |
| T70 | Fluid Kinematics | 2026-10-26 | 25 | 16 | Scheduled |
| T71 | Fluid Dynamics | 2026-10-26 | 48 | 31 | Scheduled |
| T72 | Weirs and Notches | 2026-10-18 | 20 | 13 | Scheduled |
| T73 | Laminar Flow | 2026-10-21 | 13 | 9 | Scheduled |
| T74 | Turbulent Flow | 2026-10-24 | 7 | 5 | Scheduled |
| T75 | Boundary Layer Theory | 2026-10-08 | 5 | 3 | Optional breadth |
| T76 | Drag and Lift | 2026-10-18 | 8 | 5 | Scheduled |
| T77 | Flow Through Pipes | 2026-10-07 | 35 | 22 | Scheduled |
| T78 | Model and Dimensional Analysis | 2026-10-11 | 13 | 9 | Optional breadth |
| T79 | Open Channel Flow | 2026-10-26 | 62 | 40 | Scheduled |
| T80 | Hydraulic Machines | 2026-10-15 | 42 | 27 | Scheduled |
| T81 | Hydrologic Cycle | 2026-10-04 | 15 | 10 | Scheduled |
| T82 | Runoff and Hydrograph | 2026-10-18 | 17 | 11 | Scheduled |
| T83 | Floods | 2026-10-05 | 3 | 2 | Scheduled |
| T84 | Groundwater Hydrology | 2026-10-17 | 3 | 2 | Scheduled |
| T85 | Irrigation and Methods of Irrigation | 2026-10-21 | 22 | 15 | Scheduled |
| T86 | Crop Water Requirements | 2026-10-17 | 49 | 33 | Scheduled |
| T87 | Canal Design | 2026-10-22 | 30 | 20 | Scheduled |
| T88 | Hydraulic Structure and River Training | 2026-10-22 | 46 | 30 | Scheduled |
| T89 | Highway Development and Planning | 2026-10-13 | 8 | 5 | Optional breadth |
| T90 | Geometric Design | 2026-10-07 | 66 | 42 | Scheduled |
| T91 | Traffic Engineering | 2026-10-18 | 20 | 13 | Scheduled |
| T92 | Surface Highway Materials | 2026-10-18 | 29 | 19 | Scheduled |
| T93 | Pavement Design | 2026-10-10 | 27 | 17 | Scheduled |
| T94 | Highway Construction | 2026-10-24 | 13 | 9 | Scheduled |
| T95 | Railway and Airport | 2026-10-21 | 45 | 30 | Scheduled |
| T96 | Fundamentals of Surveying | 2026-10-08 | 53 | 35 | Scheduled |
| T97 | Linear Measurements | 2026-10-07 | 81 | 51 | Scheduled |
| T98 | Compass Surveying | 2026-10-07 | 67 | 43 | Scheduled |
| T99 | Theodolite and Tacheometry | 2026-10-08 | 45 | 30 | Scheduled |
| T100 | Traversing | 2026-10-08 | 18 | 12 | Scheduled |
| T101 | Levelling | 2026-10-05 | 75 | 47 | Scheduled |
| T102 | Curves | 2026-10-08 | 11 | 7 | Scheduled |
| T103 | Measurement of Area and Volume | 2026-10-24 | 31 | 20 | Scheduled |
| T104 | Plane Table | 2026-10-21 | 22 | 15 | Scheduled |
| T105 | Contouring | 2026-10-08 | 26 | 18 | Scheduled |
| T106 | Miscellaneous | 2026-10-08 | 8 | 6 | Scheduled |
