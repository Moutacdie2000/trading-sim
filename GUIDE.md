# trading-sim · Guide d'installation et d'utilisation

Documentation complète : prérequis, build, lancement, utilisation, configuration, dépannage. Ce guide te permet de partir de zéro sur une machine vierge jusqu'à un dashboard interactif fonctionnel.

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Prérequis](#2-prérequis)
3. [Installation des outils](#3-installation-des-outils)
4. [Cloner et inspecter le projet](#4-cloner-et-inspecter-le-projet)
5. [Builder le moteur C++](#5-builder-le-moteur-c)
6. [Lancer le gateway Node.js](#6-lancer-le-gateway-nodejs)
7. [Lancer le dashboard web](#7-lancer-le-dashboard-web)
8. [Lancer le client desktop Qt 6 (optionnel)](#8-lancer-le-client-desktop-qt-6-optionnel)
9. [Variables d'environnement et flags CLI](#9-variables-denvironnement-et-flags-cli)
10. [Utilisation du dashboard, panneau par panneau](#10-utilisation-du-dashboard-panneau-par-panneau)
11. [Protocole de communication (wire protocol)](#11-protocole-de-communication-wire-protocol)
12. [Workflow type d'une session de trading](#12-workflow-type-dune-session-de-trading)
13. [Tests et CI](#13-tests-et-ci)
14. [Benchmarks](#14-benchmarks)
15. [Dépannage](#15-dépannage)
16. [Arrêt et nettoyage](#16-arrêt-et-nettoyage)

---

## 1. Vue d'ensemble

`trading-sim` est un **simulateur d'order book en temps réel**. Un moteur C++17 multi-threadé génère un flux d'ordres synthétiques (arrivées Poisson) qui matchent en continu sur un carnet limit-price-time-priority. Un gateway Node.js / TypeScript supervise ce moteur en tant que processus enfant, parse sa sortie NDJSON et la diffuse à des clients connectés en WebSocket. Le client principal est un **dashboard React** qui te laisse poser tes propres ordres et suivre ton P&L mark-to-market en live. Un **client desktop Qt 6** consomme le même flux côté natif.

L'instrument simulé par défaut est **SIMSTK** (« Acme Simulated Equity », prix de départ 100, solde initial 10 000 $).

```
 ┌─────────────────────────────────────────────────────┐
 │  engine/  (C++17)                                   │
 │  Matching engine + flow generator + sim_runner CLI  │
 │  emits NDJSON to stdout · reads commands on stdin   │
 └──────────────────────┬──────────────────────────────┘
                        │ child process IPC
                        ▼
 ┌─────────────────────────────────────────────────────┐
 │  gateway/  (Node.js + TypeScript)                   │
 │  Fastify + ws · supervises engine · /healthz /metrics│
 └──────────────────────┬──────────────────────────────┘
                        │ WebSocket /feed
                        ▼
 ┌──────────────────┐   ┌──────────────────┐
 │  web/ (React)    │   │ desktop/ (Qt 6)  │
 │  Trading dash    │   │ DepthView + tape │
 └──────────────────┘   └──────────────────┘
```

---

## 2. Prérequis

### Systèmes pris en charge

| Système | Statut |
|---|---|
| macOS 13+ (Apple Silicon ou Intel) | testé en continu |
| Linux (Ubuntu 22.04 / Debian 12) | supporté ; cible de la CI GitHub Actions |
| Windows | non testé (le moteur compile, le reste devrait fonctionner via WSL2) |

### Outils requis

| Outil | Version minimum | Pour quelle couche |
|---|---|---|
| `git` | 2.40+ | clone et historique |
| `cmake` | 3.20+ | build du moteur C++ et du desktop |
| `ninja` ou `make` | n'importe quelle version récente | générateur de build |
| compilateur C++ | clang++ 13+ ou g++ 10+ avec `-std=c++17` | moteur |
| `node` | 20+ | gateway et web |
| `npm` | 10+ (inclus avec Node 20) | gestion des deps JS |

### Outils optionnels

| Outil | Pour quoi |
|---|---|
| Qt 6.4+ (modules Core, Gui, Qml, Quick, WebSockets) | client desktop natif |
| `brew` (macOS) | gestionnaire de paquets le plus simple sur Mac |
| `gh` | interaction GitHub Actions / PR depuis la CLI |

---

## 3. Installation des outils

### Sur macOS

```bash
# 1. Xcode Command Line Tools (compilateur clang++ et outils de base)
xcode-select --install

# 2. Homebrew si pas déjà installé
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3. Outils de build C++ et Node
brew install cmake ninja node@20

# 4. (optionnel) Qt 6 pour le client desktop
brew install qt@6
# Puis ajoute Qt au PATH (zsh par défaut sur macOS récent) :
echo 'export PATH="/opt/homebrew/opt/qt@6/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Vérifie :

```bash
cmake --version    # >= 3.20
ninja --version
clang++ --version
node --version     # v20.x ou plus
npm --version
qmake6 --version   # uniquement si tu as installé Qt 6
```

### Sur Linux (Ubuntu / Debian)

```bash
# 1. Outils de base
sudo apt update
sudo apt install -y git build-essential cmake ninja-build

# 2. Node.js 20 (via NodeSource pour avoir la dernière LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. (optionnel) Qt 6
sudo apt install -y qt6-base-dev qt6-declarative-dev qt6-websockets-dev \
                    qt6-quick-controls-2-dev qml6-module-qtquick \
                    qml6-module-qtquick-controls qml6-module-qtquick-layouts
```

---

## 4. Cloner et inspecter le projet

```bash
git clone <URL-DU-REPO> trading-sim
cd trading-sim
```

Structure :

```
trading-sim/
├── engine/                   # moteur C++17
│   ├── include/engine/       # headers publics (order, order_book, flow_generator)
│   ├── src/                  # implémentation
│   ├── apps/                 # sim_runner CLI
│   ├── tests/                # GoogleTest
│   ├── benchmarks/           # bench_order_book (opt-in)
│   └── CMakeLists.txt
├── gateway/                  # gateway Node.js + TypeScript
│   ├── src/                  # Fastify + ws + EngineProcess + Hub + Metrics
│   ├── tests/                # Vitest
│   └── package.json
├── web/                      # dashboard React + Vite + TypeScript
│   ├── src/                  # composants + hook + pnlReducer
│   ├── src/__tests__/        # Vitest
│   └── package.json
├── desktop/                  # client Qt 6 (QML + C++)
│   ├── qml/                  # Main, DepthView, TradesRibbon
│   └── CMakeLists.txt
├── .github/workflows/ci.yml  # CI GitHub Actions
├── docker-compose.yml        # spin-up gateway + web en dev
└── README.md / GUIDE.md / CPP_PARADIGMS.md
```

---

## 5. Builder le moteur C++

### Configure + build

Depuis la racine du projet :

```bash
cd engine

# Configurer (Release optimisé, générateur Ninja conseillé)
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release

# Compiler en parallèle
cmake --build build -j
```

Tu obtiens :

- `engine/build/libengine.a` — bibliothèque statique du moteur
- `engine/build/apps/sim_runner` — exécutable CLI qui pilote le moteur
- `engine/build/tests/engine_tests` — suite GoogleTest

### Lancer les tests

```bash
ctest --test-dir build --output-on-failure
```

Tu dois voir 14 cas verts (matching ordinaire + Market / IOC / FOK + snapshot + flow generator).

### Tester sim_runner en isolation

```bash
./build/apps/sim_runner --rate=50 --mid=100 --seed=42 --duration=2
```

→ produit ~100 lignes de NDJSON sur stdout pendant 2 secondes. Tu verras défiler des objets `trade`, `book` et `stats`.

### Options de build avancées

```bash
# Build avec AddressSanitizer + UBSan (utile pour debug)
cmake -S . -B build-asan -DENGINE_USE_ASAN=ON
cmake --build build-asan -j
ctest --test-dir build-asan --output-on-failure

# Build des benchmarks (désactivé par défaut)
cmake -S . -B build-bench -DENGINE_BUILD_BENCHES=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build-bench -j
./build-bench/benchmarks/bench_order_book
```

Sortie attendue du bench sur une machine Apple Silicon récente :
```
N=10000  orders/sec=~5.7M  p50=0.08us  p99=0.42us
```

### Si tu n'as pas CMake

Tu peux compiler `sim_runner` manuellement avec clang++ pour un dépannage rapide :

```bash
cd engine
clang++ -std=c++17 -O2 -Wall -Wextra -Wpedantic \
  -Iinclude \
  src/order_book.cpp src/flow_generator.cpp apps/sim_runner.cpp \
  -pthread \
  -o build_sim_runner

./build_sim_runner --duration=1
```

C'est ce que fait le projet en interne quand on ne peut pas s'appuyer sur CMake.

---

## 6. Lancer le gateway Node.js

### Premier démarrage

```bash
cd gateway

# Installation des dépendances (npm prend ~30s)
npm install

# Lancement en mode dev (tsx watch, rechargement à chaud)
ENGINE_BIN=../engine/build/apps/sim_runner npm run dev
```

Tu dois voir dans la console quelque chose comme :

```
{"level":30,"time":...,"pid":...,"hostname":"...","msg":"Server listening at http://0.0.0.0:8080"}
```

Si le port 8080 est déjà pris (souvent par OrbStack, Docker Desktop, etc.) :

```bash
PORT=8090 ENGINE_BIN=../engine/build/apps/sim_runner npm run dev
```

### Vérifier que le gateway répond

Dans un autre terminal :

```bash
curl http://localhost:8080/healthz
# → {"ok":true}

curl http://localhost:8080/metrics
# → texte Prometheus (clients gauge, events counter, restarts counter)
```

### Build de production

```bash
npm run build           # tsc -> dist/
node dist/index.js      # démarrage du binaire compilé
```

### Lancer les tests Vitest

```bash
npm test
```

→ 16 tests verts (Hub, Metrics, EngineProcess restart, types).

---

## 7. Lancer le dashboard web

```bash
cd web

# Installation (~ 20s)
npm install

# Lancement Vite avec l'URL du gateway
VITE_FEED_URL=ws://localhost:8090/feed npm run dev
```

Sortie :

```
  VITE v5.4.21  ready in 200 ms
  ➜  Local:   http://127.0.0.1:5173/
```

Ouvre cette URL dans ton navigateur. Le dashboard se connecte automatiquement au gateway via WebSocket et commence à afficher des données.

### Build de production

```bash
npm run build           # tsc -b + vite build → dist/
npm run preview         # sert dist/ en local
```

### Tests + lint

```bash
npm test                # vitest, 48 tests
npm run lint            # eslint, doit être à zéro warning
```

---

## 8. Lancer le client desktop Qt 6 (optionnel)

Prérequis : Qt 6.4+ installé (cf. section 3).

```bash
cd desktop

cmake -S . -B build -G Ninja
cmake --build build -j

./build/trading_desktop
```

Le client se connecte automatiquement sur `ws://localhost:8080/feed`. Tu peux modifier l'URL en éditant `main.cpp` (le `connectTo(QUrl(...))`) ou en passant un argument après refactor.

Si CMake ne trouve pas Qt 6 :

```bash
# macOS Homebrew
cmake -S . -B build -G Ninja -DCMAKE_PREFIX_PATH=/opt/homebrew/opt/qt@6

# Linux apt
cmake -S . -B build -G Ninja -DCMAKE_PREFIX_PATH=/usr/lib/x86_64-linux-gnu/cmake/Qt6
```

---

## 9. Variables d'environnement et flags CLI

### Gateway (`gateway/src/index.ts`)

| Variable | Défaut | Effet |
|---|---|---|
| `ENGINE_BIN` | `../engine/build/apps/sim_runner` | chemin vers le binaire du moteur |
| `PORT` | `8080` | port HTTP/WebSocket |
| `SYMBOL` | `SIMSTK` | ticker affiché dans le dashboard |
| `INSTRUMENT_NAME` | `Acme Simulated Equity` | nom complet |
| `STARTING_PRICE` | `100` | prix de référence (utilisé par le dashboard pour le label) |
| `STARTING_BALANCE` | `10000` | solde initial annoncé au client |

Exemple, simuler du Bitcoin :

```bash
SYMBOL=BTC INSTRUMENT_NAME="Bitcoin (sim)" \
STARTING_PRICE=50000 STARTING_BALANCE=100000 \
PORT=8090 \
ENGINE_BIN=../engine/build/apps/sim_runner \
npm run dev
```

### Moteur (`engine/apps/sim_runner.cpp`)

| Flag | Défaut | Effet |
|---|---|---|
| `--rate=<N>` | `20.0` | ordres synthétiques par seconde |
| `--mid=<X>` | `100.0` | prix mid initial (drift Brownien à partir d'ici) |
| `--seed=<N>` | epoch courant | seed du `mt19937_64` (déterminisme) |
| `--duration=<sec>` | `0` (infini, SIGINT pour quitter) | durée totale de la simulation |
| `--book-depth=<N>` | `5` | profondeur des snapshots `book` |

Exemple :

```bash
./build/apps/sim_runner --rate=200 --mid=50000 --seed=42 --duration=10
```

### Web (`web/src/App.tsx`)

| Variable Vite | Défaut | Effet |
|---|---|---|
| `VITE_FEED_URL` | `ws://localhost:8080/feed` | URL du gateway WebSocket |

### CMake (engine)

| Option | Défaut | Effet |
|---|---|---|
| `ENGINE_BUILD_TESTS` | `ON` | construit `engine_tests` |
| `ENGINE_BUILD_APPS` | `ON` | construit `sim_runner` |
| `ENGINE_BUILD_BENCHES` | `OFF` | construit `bench_order_book` |
| `ENGINE_USE_ASAN` | `OFF` | active `-fsanitize=address,undefined` |

---

## 10. Utilisation du dashboard, panneau par panneau

### Header

- **Logo `trading-sim`** : en haut à gauche.
- **Pill `SIMSTK · Acme Simulated Equity`** : l'instrument que tu trades. Vient de l'event `config` émis par le gateway.
- **Pill `live` / `disconnected`** : statut de la connexion WebSocket. En cas de déconnexion, un compte à rebours « Reconnecting in Ns » apparaît.
- **Chip 💰 $X.XX** : ton **cash disponible** (= balance − cash réservé par les limit BUY resting). Survoler affiche balance + réservé.
- **Bouton `⏸ Pause flow` / `▶ Resume flow`** : arrête le générateur synthétique (les ordres utilisateurs continuent de marcher). Utile pour expérimenter sans bruit.
- **Pill `? What is this`** : ré-ouvre la bannière d'explication initiale.

### Panneau « Submit order »

Le formulaire principal pour poser tes ordres.

- **Bouton Buy / Sell** : choix du côté. Buy en vert, Sell en rouge.
- **Type d'ordre** :
  - **Limit** : se pose sur le book à ton prix si pas de match. Reste actif jusqu'à ce que tu cancelles. *Réserve du cash dans la balance.*
  - **Market** : ignore le prix, match immédiatement contre la meilleure liquidité disponible. Le reste non rempli disparaît.
  - **IOC (Immediate-Or-Cancel)** : limit qui essaie de se remplir tout de suite ; ce qui ne se remplit pas est annulé.
  - **FOK (Fill-Or-Kill)** : tout ou rien. Si le carnet ne peut pas tout absorber au prix, **l'ordre est rejeté** sans toucher le book.
- **Price** : prix limite. Sous le champ, trois boutons rapides :
  - **bid X.XX** : utilise le meilleur bid (utile pour rester maker).
  - **mid** : (best_bid + best_ask) / 2.
  - **ask X.XX** : utilise le meilleur ask (équivalent à un market BUY au prix actuel).
- **Quantity** : qty entière, ≥ 1.
- **Est. cost** : pour un BUY, montre `qty × prix de référence` (avec un buffer de slippage de 2 % pour les market). Comparé à ton cash disponible. Si > available → bouton désactivé.
- **Bouton de soumission** : `Send BUY (Enter)` ou `Not enough cash`. Touche **Entrée** depuis n'importe quel champ → submit.
- **Feedback** : flash vert en cas de succès, flash rouge en cas d'erreur, message explicite affiché.

### Chandelier (« Price · N candles »)

- **Bougies OHLCV** : open / high / low / close + volume par bucket.
- **Bullish** (close ≥ open) en vert ; **bearish** en rouge. Mèches (wicks) pour high/low.
- **Tooltip** au survol d'une bougie : timestamp, OHLC, volume.
- **Étiquette du dernier prix** à droite (sur fond bleu).
- **Sélecteur d'intervalle** au-dessus : `1s / 5s / 15s / 1m / 5m`. Le chart re-bucket instantanément depuis le buffer brut (~60 s de trades).

### Panneau « P&L »

| Ligne | Sens |
|---|---|
| **Cash balance** | argent liquide actuel |
| · reserved (resting buys) | cash bloqué par tes limit BUYs en attente |
| · available | balance − reserved |
| **Position** | taille de ta position (positif = long, négatif = short) |
| · avg cost | prix moyen pondéré d'entrée |
| **Mark price** | mid actuel (best_bid + best_ask) / 2 |
| **Realized P&L** | gains/pertes déjà encaissés (fermés) |
| **Unrealized P&L** | `position × (mark − avgCost)`, peut changer avec le marché |
| **Total P&L** | `realized + unrealized` (= `equity − baseline`) avec % de return |

**Invariant** : `Total = Realized + Unrealized`. C'est documenté par un test (`pnlReducer.test.ts`).

Boutons :

- **✕ Close position** : envoie un market order opposé à la position. Désactivé quand `position == 0`.
- **+ Recharge $10k** : ajoute du cash pour continuer à trader sans toucher le P&L (la baseline est ajustée).
- **Reset** : annule les limit orders actuellement resting sur le moteur, vide le P&L local et l'historique. La connexion WebSocket reste vivante.

### Depth chart

Histogramme cumulatif de la liquidité, **bids à gauche en vert, asks à droite en rouge**, ligne en pointillé pour le mid. Affiche les 5 niveaux de chaque côté.

### Recent trades

Liste des 50 derniers trades. Les trades dans lesquels TU es impliqué sont **surlignés en jaune** avec un tag `YOU BUY` ou `YOU SELL`. Format `HH:MM:SS · qty @ price`.

### Order book

Les 5 meilleurs niveaux de chaque côté en table : `Bid qty | Bid` à gauche, `Ask | Ask qty` à droite. C'est le snapshot brut envoyé par le moteur toutes les ~500 ms (1 snapshot tous les 10 ordres synthétiques).

### My orders

Tableau de tes ordres récents (max 20). Colonnes :

- **Side / Type / Price / Filled (X/Y)**
- **Status pill** :
  - `pending` : envoyé, en attente d'ack
  - `live` : accepté par le moteur, sur le book ou en cours de matching
  - `filled` : entièrement rempli
  - `cancelled` : annulé (par toi ou par Reset)
  - `rejected` : refusé par le moteur (FOK sans liquidité suffisante)
- **Action** `cancel` : visible uniquement pour les ordres `live` resting (limit accepted, pas encore remplis).

### Stats panel

- **Orders/sec** : calculé à partir des deltas entre deux events `stats` consécutifs.
- **Trades/sec** : idem.
- **Last update age** : « 3s ago », rafraîchi.
- **Sparkline** : prix au dernier trade sur les 60 dernières secondes.

---

## 11. Protocole de communication (wire protocol)

### Côté serveur → client

Tous les events sont des objets JSON unilignes (NDJSON), reçus via le WebSocket `/feed`.

```jsonc
// Trade exécuté
{"type":"trade","ts":1715600000123,"price":100.50,"qty":4,
 "buy":1,"sell":2,"user_buy":true}     // user_buy / user_sell présents si tu es impliqué

// Snapshot d'un côté du book (tous les ~10 ordres)
{"type":"book","ts":1715600000124,
 "bids":[[100.0,10],[99.5,20]],
 "asks":[[101.0,5]]}

// Compteurs de session (toutes les 5s)
{"type":"stats","ts":1715600000125,"orders":520,"trades":134,"books":52}

// Pause / resume
{"type":"state","ts":1715600000200,"paused":true}

// Accusé de réception d'une commande
{"type":"ack","ts":...,"kind":"submit","order_id":1000000000,"client_id":"abc-123"}
{"type":"ack","ts":...,"kind":"cancel","order_id":1000000000,"ok":true}
{"type":"ack","ts":...,"kind":"reject","order_id":1000000005,"client_id":"fok-7","reason":"insufficient depth"}

// Identification de l'instrument (envoyé à chaque nouvelle connexion)
{"type":"config","ts":...,"symbol":"SIMSTK","instrument_name":"Acme Simulated Equity",
 "starting_price":100,"starting_balance":10000}
```

### Côté client → serveur

Tu peux envoyer des commandes JSON via le même WebSocket :

```jsonc
{"cmd":"submit","side":"buy","type":"limit","price":100.5,"qty":5,"client_id":"abc-123"}
{"cmd":"submit","side":"sell","type":"market","price":0,"qty":3,"client_id":"abc-124"}
{"cmd":"cancel","id":1000000000}
{"cmd":"pause"}
{"cmd":"resume"}
```

Le gateway valide chaque commande (régex sur le `client_id`, types stricts) et la traduit en une ligne ASCII envoyée sur stdin du moteur :

```
submit buy limit 100.5 5 abc-123
cancel 1000000000
pause
resume
```

---

## 12. Workflow type d'une session de trading

1. Lance les 3 services (`engine`, `gateway`, `web`) avec leurs commandes respectives.
2. Ouvre `http://127.0.0.1:5173/` dans ton navigateur.
3. Attends quelques secondes pour que le book se remplisse — tu vois la pill **live**, le mid affiché, les bougies se construire.
4. **Pose un limit BUY** : clique sur le bouton `bid X.XX` pour utiliser le meilleur bid, mets qty=5, presse Entrée. L'ordre passe en `pending → live`, le cash réservé s'affiche.
5. **Attends qu'un seller synthétique te frappe** : l'ordre devient `filled`, ta position monte à +5, l'avg cost = le prix de fill.
6. **Surveille l'unrealized P&L** : il bouge en temps réel selon le mid.
7. **Soumets une limit SELL** au-dessus pour vendre quand le marché monte, ou clique sur `✕ Close position` pour sortir en market immédiatement.
8. À la sortie, **Realized** se grave dans le P&L et reste indépendant des variations futures du mark.
9. **Recharge $10k** si tu veux continuer après une mauvaise série sans skew le P&L.
10. **Reset** quand tu veux repartir de zéro.

Essaye aussi :
- Un **market BUY 50** : tu vas walk the book et le prix moyen de fill sera pire que le best ask. Regarde l'avg cost.
- Un **FOK BUY 1000** : sera rejeté (`rejected` status) avec `reason: insufficient depth`.
- **Pause** + soumettre des ordres : tu joues seul contre tes propres ordres, parfait pour explorer les transitions long/short.

---

## 13. Tests et CI

### Lancer tous les tests localement

```bash
# Engine (14 GoogleTest)
ctest --test-dir engine/build --output-on-failure

# Gateway (16 Vitest)
cd gateway && npm test

# Web (48 Vitest)
cd ../web && npm test
```

Total : **78 tests verts**.

### CI GitHub Actions

Le fichier `.github/workflows/ci.yml` lance 3 jobs en parallèle sur chaque push / PR :

| Job | Plateforme | Commandes |
|---|---|---|
| `engine` | Ubuntu | `cmake + ctest --output-on-failure` |
| `gateway` | Ubuntu Node 20 | `npm ci && npm run lint && npm run build && npm test` |
| `web` | Ubuntu Node 20 | `npm ci && npm run build` |

---

## 14. Benchmarks

```bash
cd engine
cmake -S . -B build-bench -DENGINE_BUILD_BENCHES=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build-bench -j
./build-bench/benchmarks/bench_order_book
```

Sortie attendue (Apple Silicon M2) :

| N (resting orders) | orders/sec | p50 add_order | p99 add_order |
|---:|---:|---:|---:|
| 100 | ~5.7 M | 0.08 µs | 0.42 µs |
| 1 000 | ~5.7 M | 0.08 µs | 0.42 µs |
| 10 000 | ~5.7 M | 0.08 µs | 0.42 µs |

Ces chiffres sont indicatifs et dépendent de ta machine. Le but du bench est de mesurer **la régression de perf entre deux PRs**.

---

## 15. Dépannage

### « Port already in use » au lancement du gateway

```bash
lsof -i :8080
# ou
lsof -i :8090
# Identifie ce qui tient le port, puis :
PORT=8095 npm run dev
```

OrbStack ou Docker Desktop occupent souvent `8080` sur macOS.

### Dashboard tout blanc, console pleine d'erreurs

C'est probablement le cache Vite ou un import qui ne résout pas. Solution :

```bash
cd web
rm -rf node_modules/.vite dist
npm install
npm run dev
```

Et hard refresh dans le navigateur : `Cmd+Shift+R` (macOS) / `Ctrl+Shift+R` (Linux).

### Tests Vitest échouent avec des erreurs JSDOM

Vérifie que `jsdom` est installé (dans `web/package.json`). Sinon :

```bash
cd web
npm install --save-dev jsdom
```

### Engine binary not found

Le gateway log indique `Error: spawn .../sim_runner ENOENT`. Vérifie que tu as bien build l'engine ET que `ENGINE_BIN` pointe vers le bon chemin :

```bash
ls -la engine/build/apps/sim_runner   # doit exister et être exécutable
ENGINE_BIN=$(pwd)/engine/build/apps/sim_runner cd gateway && npm run dev
```

### Engine restart loop

Si le gateway log affiche en boucle `engine restart scheduled` puis `engine giving up`, c'est que `sim_runner` crashe à chaque démarrage. Lance-le seul pour diagnostiquer :

```bash
./engine/build/apps/sim_runner --duration=1
echo "exit code: $?"
```

### WebSocket se ferme tout de suite (code 1006)

Vérifie que le gateway tourne :

```bash
curl http://localhost:8090/healthz
# ok ?
```

Et qu'il n'y a pas un proxy / firewall entre toi et `localhost:8090`.

### Build CMake : « Could not find Qt6 »

Indique-lui où chercher Qt :

```bash
# macOS Homebrew
cmake -S desktop -B desktop/build -DCMAKE_PREFIX_PATH=/opt/homebrew/opt/qt@6

# Linux apt
cmake -S desktop -B desktop/build -DCMAKE_PREFIX_PATH=/usr/lib/x86_64-linux-gnu/cmake/Qt6
```

---

## 16. Arrêt et nettoyage

### Arrêter les services en cours

Si tu as lancé en mode dev avec `npm run dev`, presse `Ctrl+C` dans chaque terminal.

Si tu les a backgroundé :

```bash
# Si tu as gardé les PIDs (le projet utilise /tmp/gateway.pid et /tmp/web.pid)
kill $(cat /tmp/gateway.pid /tmp/web.pid) 2>/dev/null

# Sinon, en force :
pkill -f "tsx.*gateway/src/index"
pkill -f "vite"
pkill -f sim_runner
```

### Nettoyer les artefacts de build

```bash
rm -rf engine/build engine/build-asan engine/build-bench engine/build_sim_runner
rm -rf gateway/node_modules gateway/dist
rm -rf web/node_modules    web/dist    web/node_modules/.vite
rm -rf desktop/build
```

### Cleanup git complet (rare, à utiliser avec précaution)

```bash
git clean -fdx     # supprime tout ce qui n'est pas tracké, y compris .gitignore-d
git reset --hard   # remet à l'état du dernier commit
```

---

Bon trade !
