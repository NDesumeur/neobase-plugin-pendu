// Pendu : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoDex sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoDex.
// Elle tourne dans le bac à sable de NeoDex, avec ses outils d'interface (ctx.host) et seulement les autorisations de son plugin.json.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Pendu</span><span class=\"hint\" id=\"hgInfo\"></span><div class=\"agNav\"><select class=\"f gSel\" id=\"hgTheme\"></select><select class=\"f gSel\" id=\"hgLevel\"><option value=\"facile\">Facile · 10 erreurs</option><option value=\"normal\" selected>Normal · 8 erreurs</option><option value=\"difficile\">Difficile · 6 erreurs</option><option value=\"expert\">Expert · 4 erreurs</option></select><button class=\"btn px\" id=\"hgHint\">INDICE (1 ERREUR)</button><button class=\"btn px\" id=\"hgNew\">NOUVEAU MOT</button></div></div>\n      <div class=\"sysCard px hgMain\"><canvas id=\"hgCanvas\" width=\"64\" height=\"64\"></canvas><div class=\"hgSide\"><div id=\"hgWord\"></div><span class=\"hint\" id=\"hgThemeName\"></span><span class=\"label\" id=\"hgLives\"></span><div id=\"hgMsg\" class=\"hgMsg\"></div></div></div>\n      <div id=\"hgKeys\"></div>\n      <div class=\"hint\">Clique les lettres ou tape-les au clavier (Entrée : mot suivant). Les accents ne comptent pas : E trouve aussi É, È et Ê.</div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.gSel{width:auto;font-size:14px;padding:6px 10px;margin-right:8px}
.hgMain{flex-direction:row;align-items:center;gap:34px;padding:24px 28px}
#hgCanvas{width:256px;height:256px;image-rendering:pixelated;flex:none}
.hgSide{display:flex;flex-direction:column;gap:14px;min-width:0}
#hgWord{display:flex;flex-wrap:wrap;gap:8px}
#hgWord span{width:34px;height:46px;display:grid;place-items:center;font:20px var(--title);color:#fff;box-shadow:inset 0 -4px 0 var(--line2)}
#hgWord span.on{box-shadow:inset 0 -4px 0 var(--pink)}
#hgWord span.miss{color:var(--red)}
#hgWord span.sep{box-shadow:none;width:16px}
.hgMsg{font:12px var(--title);min-height:16px;color:var(--lilac);line-height:1.5}
.hgMsg.won{color:#8ee8a0}
.hgMsg.lost{color:var(--red)}
#hgKeys{display:flex;flex-direction:column;align-items:center;gap:10px}
.hgRow{display:flex;gap:10px}
.hgKey{--fill:var(--btn);border:0;padding:0;width:54px;height:54px;font:16px var(--title);color:#fff;cursor:var(--cp,pointer)}
.hgKey:hover:not(:disabled){--fill:var(--btnh);--c:var(--violet)}
.hgKey.good{--fill:#1d4a34;--c:#2fbf71;color:#8ee8a0}
.hgKey.bad{--fill:#2a0b1a;--c:#5a1f36;color:var(--red)}
.hgKey:disabled{cursor:default}
.nbaTeam.lost .tn{color:var(--muted)}
`;  // le style de ce plugin (il utilise les variables du thème de NeoDex)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoDex pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "hangApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const LEGACY_GAMES = {"top":["hang"],"best":"^hang"};
  let games = await doc('games');
  if (games == null) {  // première ouverture : tu retrouves tes records et tes parties d'avant
    const old = legacy.api ? await legacy.api('games').catch(() => null) : null; games = { best: {} };
    if (old) { const re = new RegExp(LEGACY_GAMES.best); for (const [k, v] of Object.entries(old.best || {})) if (re.test(k)) games.best[k] = v; for (const k of LEGACY_GAMES.top) if (old[k] !== undefined) games[k] = old[k]; await folder.write('games', games); }
  }
  games = { best: {}, ...games };
  let gamesTimer = null;
  const saveGames = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(() => { gamesTimer = null; folder.write('games', games).catch(() => {}); }, 500); };
  const best = (k, v, higher = true) => { const b = games.best[k]; if (b == null || (higher ? v > b : v < b)) { games.best[k] = v; saveGames(); return true; } return false; };
  const gstore = (k, init) => (games[k] ??= init);  // la section d'un jeu
function gameLoop(st, appKey, update, draw) {
  cancelAnimationFrame(st.raf);
  const STEP = 1000 / 60; let acc = 0, last = performance.now();
  const frame = t => {
    if (!view.classList.contains('on')) { st.raf = 0; if (st.mode === 'play') st.mode = 'pause'; return; }  // leaving the tab pauses the game
    st.raf = requestAnimationFrame(frame);
    acc += Math.min(200, t - last); last = t;
    while (acc >= STEP) { if (st.mode === 'play') update(); st.tick++; acc -= STEP; }
    draw();
  };
  st.raf = requestAnimationFrame(frame);
}
function gameText(g, w, lines, y0) {  // centred pixel-font lines over a dark band
  g.fillStyle = 'rgba(11,3,28,.72)'; g.fillRect(0, y0 - 14, w, lines.length * 14 + 14);
  g.textAlign = 'center';
  lines.forEach(([text, color, size], i) => { g.fillStyle = color; g.font = (size || 8) + 'px "Press Start 2P", monospace'; g.fillText(text, w / 2, y0 + i * 14); });
  g.textAlign = 'left';
}
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, rows, x, y, pal) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, c, x + i, y + j); } }); }
  // ---- ton code d'origine ----
const seeded = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* word lists for Pendu and Mots mêlés: one theme per entry, words separated by commas (accents kept, shown at the end) */
const WORDS = {
  'Animaux': 'chat, chien, lion, tigre, éléphant, girafe, zèbre, hippopotame, rhinocéros, crocodile, alligator, serpent, tortue, lézard, grenouille, crapaud, salamandre, triton, aigle, faucon, épervier, buse, hibou, chouette, corbeau, corneille, pie, pigeon, tourterelle, moineau, mésange, rouge-gorge, merle, rossignol, hirondelle, perroquet, perruche, toucan, flamant, pélican, cigogne, héron, canard, oie, cygne, poule, coq, poussin, dinde, paon, faisan, caille, autruche, émeu, manchot, pingouin, ours, loup, renard, lynx, panthère, jaguar, guépard, léopard, puma, hyène, chacal, coyote, singe, gorille, chimpanzé, orang-outan, babouin, lémurien, koala, kangourou, wallaby, wombat, ornithorynque, castor, loutre, blaireau, hérisson, écureuil, lapin, lièvre, souris, rat, mulot, hamster, cochon d\'inde, taupe, chauve-souris, cheval, poney, âne, mulet, zébu, vache, taureau, veau, buffle, yack, mouton, agneau, bélier, chèvre, bouc, cochon, sanglier, phacochère, cerf, biche, chevreuil, daim, élan, renne, caribou, bison, chameau, dromadaire, lama, alpaga, vigogne, panda, raton laveur, mouffette, phoque, morse, otarie, lamantin, dauphin, marsouin, baleine, cachalot, orque, narval, requin, méduse, pieuvre, poulpe, calmar, seiche, crabe, homard, langouste, crevette, étoile de mer, oursin, abeille, bourdon, guêpe, frelon, fourmi, termite, papillon, chenille, libellule, coccinelle, scarabée, hanneton, sauterelle, criquet, grillon, cigale, mante religieuse, moustique, mouche, puce, araignée, tarentule, scorpion, escargot, limace, ver de terre, mille-pattes, caméléon, iguane, varan, gecko, cobra, python, vipère, anaconda, boa, gazelle, antilope, gnou, impala, okapi, tapir, tatou, paresseux, fourmilier, suricate, mangouste, belette, hermine, furet, vison, martre, marmotte, chinchilla, porc-épic, colibri, pivert, martin-pêcheur, vautour, condor, albatros, mouette, goéland, macareux, kiwi, casoar, ara, cacatoès, gerboise, capybara, axolotl, dingo, fennec, loris, gibbon, tamanoir, pangolin, hippocampe, pélican, mammouth',
  'Pays': 'france, belgique, suisse, luxembourg, monaco, andorre, espagne, portugal, italie, allemagne, autriche, pays-bas, danemark, norvège, suède, finlande, islande, irlande, royaume-uni, écosse, pologne, tchéquie, slovaquie, hongrie, roumanie, bulgarie, grèce, chypre, malte, croatie, slovénie, serbie, bosnie, monténégro, albanie, macédoine, kosovo, moldavie, ukraine, biélorussie, russie, lituanie, lettonie, estonie, turquie, géorgie, arménie, azerbaïdjan, kazakhstan, ouzbékistan, turkménistan, kirghizistan, tadjikistan, afghanistan, pakistan, inde, népal, bhoutan, bangladesh, sri lanka, maldives, chine, mongolie, japon, corée, taïwan, vietnam, laos, cambodge, thaïlande, birmanie, malaisie, singapour, indonésie, philippines, brunei, australie, nouvelle-zélande, fidji, samoa, tonga, vanuatu, papouasie, iran, irak, syrie, liban, israël, palestine, jordanie, arabie saoudite, yémen, oman, émirats, qatar, bahreïn, koweït, égypte, libye, tunisie, algérie, maroc, mauritanie, mali, niger, tchad, soudan, éthiopie, érythrée, djibouti, somalie, kenya, ouganda, rwanda, burundi, tanzanie, mozambique, malawi, zambie, zimbabwe, botswana, namibie, angola, congo, gabon, cameroun, nigeria, bénin, togo, ghana, sénégal, gambie, guinée, liberia, burkina, madagascar, maurice, seychelles, comores, cap-vert, afrique du sud, lesotho, eswatini, canada, mexique, guatemala, honduras, salvador, nicaragua, panama, cuba, jamaïque, haïti, bahamas, barbade, colombie, venezuela, guyana, suriname, équateur, pérou, bolivie, brésil, paraguay, uruguay, argentine, chili, groenland',
  'Villes': 'paris, marseille, lyon, toulouse, nice, nantes, strasbourg, montpellier, bordeaux, lille, rennes, reims, toulon, grenoble, dijon, angers, nîmes, brest, limoges, tours, amiens, perpignan, metz, besançon, orléans, rouen, caen, nancy, avignon, poitiers, la rochelle, calais, dunkerque, boulogne, arras, lens, douai, valenciennes, cambrai, béthune, liévin, saint-omer, le havre, cherbourg, ajaccio, bastia, biarritz, bayonne, pau, lourdes, annecy, chamonix, cannes, antibes, ajaccio, colmar, mulhouse, troyes, chartres, versailles, bruxelles, liège, namur, bruges, gand, anvers, genève, lausanne, berne, zurich, bâle, londres, manchester, liverpool, édimbourg, dublin, madrid, barcelone, séville, valence, lisbonne, porto, rome, milan, naples, venise, florence, turin, berlin, munich, hambourg, cologne, francfort, vienne, prague, varsovie, cracovie, budapest, bucarest, athènes, istanbul, amsterdam, rotterdam, copenhague, oslo, stockholm, helsinki, moscou, kiev, new york, los angeles, chicago, miami, boston, seattle, san francisco, las vegas, montréal, québec, toronto, vancouver, mexico, rio de janeiro, buenos aires, santiago, lima, bogota, tokyo, osaka, kyoto, séoul, pékin, shanghai, hong kong, singapour, bangkok, hanoï, delhi, bombay, dubaï, le caire, marrakech, casablanca, alger, tunis, dakar, abidjan, sydney, melbourne, auckland',
  'Métiers': 'boulanger, pâtissier, boucher, charcutier, poissonnier, fromager, cuisinier, serveur, barman, sommelier, agriculteur, éleveur, vigneron, jardinier, paysagiste, fleuriste, bûcheron, pêcheur, berger, apiculteur, maçon, charpentier, menuisier, plombier, électricien, peintre, carreleur, couvreur, serrurier, vitrier, mécanicien, carrossier, garagiste, chauffeur, livreur, routier, conducteur, pilote, steward, hôtesse, marin, capitaine, douanier, policier, gendarme, pompier, militaire, soldat, médecin, chirurgien, infirmier, dentiste, pharmacien, vétérinaire, kinésithérapeute, ostéopathe, sage-femme, psychologue, opticien, ambulancier, aide-soignant, professeur, instituteur, éducateur, animateur, bibliothécaire, chercheur, scientifique, ingénieur, architecte, géomètre, informaticien, développeur, programmeur, technicien, graphiste, designer, photographe, journaliste, écrivain, éditeur, traducteur, interprète, comédien, acteur, chanteur, musicien, danseur, réalisateur, scénariste, dessinateur, illustrateur, mangaka, animateur radio, avocat, juge, notaire, huissier, comptable, banquier, assureur, commercial, vendeur, caissier, gérant, secrétaire, standardiste, facteur, coiffeur, esthéticienne, couturier, styliste, bijoutier, horloger, cordonnier, tailleur, astronaute, astronome, archéologue, géologue, biologiste, chimiste, physicien, mathématicien, économiste, sociologue, historien, guide, moniteur, entraîneur, arbitre, sportif, footballeur, streamer, youtubeur, influenceur, magicien, clown, détective, espion, gardien, concierge, plongeur, cascadeur, pâtissier',
  'Fruits et légumes': 'pomme, poire, banane, orange, citron, pamplemousse, mandarine, clémentine, kiwi, ananas, mangue, papaye, goyave, litchi, fruit de la passion, grenade, figue, datte, abricot, pêche, nectarine, prune, mirabelle, cerise, fraise, framboise, myrtille, mûre, groseille, cassis, raisin, melon, pastèque, noix de coco, avocat, kaki, coing, rhubarbe, olive, châtaigne, noisette, noix, amande, pistache, cacahuète, carotte, pomme de terre, patate douce, tomate, concombre, courgette, aubergine, poivron, piment, oignon, échalote, ail, poireau, céleri, fenouil, radis, navet, betterave, panais, topinambour, salade, laitue, mâche, roquette, épinard, chou, chou-fleur, brocoli, chou de bruxelles, artichaut, asperge, haricot, petit pois, pois chiche, lentille, fève, maïs, champignon, citrouille, potiron, courge, butternut, endive, cresson, persil, ciboulette, basilic, menthe, thym, romarin, coriandre, gingembre, cornichon, câpre, physalis, kumquat, carambole, pitaya, durian, ramboutan, mangoustan, yuzu, bergamote, clémentine',
  'Cuisine': 'baguette, croissant, brioche, pain au chocolat, crêpe, gaufre, galette, quiche, tarte, gratin, raclette, fondue, tartiflette, cassoulet, choucroute, ratatouille, bouillabaisse, blanquette, pot-au-feu, bœuf bourguignon, coq au vin, hachis parmentier, croque-monsieur, omelette, soufflé, purée, frites, steak, escalope, saucisse, jambon, poulet, rôti, côtelette, brochette, hamburger, sandwich, pizza, lasagnes, spaghetti, tagliatelles, ravioli, risotto, paella, couscous, tajine, kebab, falafel, houmous, taboulé, sushi, maki, ramen, udon, tempura, gyoza, onigiri, curry, nems, samoussa, tacos, burrito, nachos, chili, soupe, potage, velouté, salade, vinaigrette, mayonnaise, ketchup, moutarde, béchamel, sauce, fromage, camembert, roquefort, comté, brie, emmental, reblochon, chèvre, yaourt, beurre, crème, lait, œuf, farine, sucre, sel, poivre, huile, vinaigre, miel, confiture, chocolat, caramel, vanille, cannelle, gâteau, éclair, macaron, mille-feuille, profiterole, madeleine, financier, cookie, muffin, cupcake, beignet, churros, tiramisu, crème brûlée, mousse, flan, sorbet, glace, chantilly, compote, smoothie, café, thé, chocolat chaud, jus, limonade, sirop, cantine, fourchette, couteau, cuillère, casserole, poêle, four, mixeur, fouet, saladier, passoire, louche',
  'Sports': 'football, basketball, handball, volley-ball, rugby, tennis, badminton, ping-pong, squash, golf, hockey, baseball, cricket, natation, plongeon, water-polo, aviron, canoë, kayak, voile, surf, planche à voile, kitesurf, ski, snowboard, patinage, curling, biathlon, luge, bobsleigh, athlétisme, marathon, sprint, saut en hauteur, saut en longueur, perche, javelot, disque, marteau, haies, relais, triathlon, cyclisme, vélo, bmx, vtt, escalade, alpinisme, randonnée, course, trail, boxe, judo, karaté, taekwondo, lutte, escrime, aïkido, kung-fu, capoeira, sumo, gymnastique, trampoline, danse, équitation, polo, pétanque, bowling, billard, fléchettes, tir à l\'arc, skateboard, roller, parkour, parapente, parachutisme, motocross, rallye, formule un, karting, haltérophilie, musculation, crossfit, yoga, pilates, échecs, esport, arbitre, stade, ballon, raquette, filet, panier, but, penalty, médaille, champion, coupe, maillot, crampons, dossard, podium, chronomètre, entraînement, supporter',
  'Maison': 'maison, appartement, chambre, salon, cuisine, salle de bain, toilettes, couloir, grenier, cave, garage, jardin, balcon, terrasse, escalier, porte, fenêtre, volet, rideau, store, mur, plafond, plancher, carrelage, moquette, tapis, toit, cheminée, radiateur, chauffage, climatisation, lit, matelas, oreiller, couverture, couette, drap, armoire, commode, placard, étagère, bibliothèque, bureau, chaise, fauteuil, canapé, tabouret, table, buffet, miroir, lampe, lustre, ampoule, interrupteur, prise, rallonge, télévision, ordinateur, téléphone, tablette, enceinte, réveil, horloge, pendule, réfrigérateur, congélateur, lave-vaisselle, lave-linge, sèche-linge, aspirateur, balai, serpillière, éponge, poubelle, cafetière, bouilloire, grille-pain, micro-ondes, robot, assiette, verre, tasse, bol, carafe, bouteille, plateau, nappe, serviette, savon, shampoing, dentifrice, brosse à dents, peigne, sèche-cheveux, baignoire, douche, lavabo, robinet, évier, parapluie, clé, serrure, sonnette, boîte aux lettres, coussin, cadre, tableau, vase, bougie, plante, pot, arrosoir, tondeuse, râteau, pelle, brouette, outil, marteau, tournevis, perceuse, scie, clou, vis, échelle, ciseaux, scotch, colle, crayon, stylo, gomme, cahier, classeur, agrafeuse, calculatrice',
  'Nature': 'forêt, montagne, colline, vallée, plaine, plateau, falaise, rocher, caillou, galet, sable, plage, dune, désert, oasis, savane, jungle, prairie, marais, étang, lac, rivière, fleuve, ruisseau, torrent, cascade, source, glacier, iceberg, banquise, volcan, cratère, lave, grotte, caverne, île, presqu\'île, archipel, océan, mer, vague, marée, récif, corail, lagon, baie, golfe, détroit, arbre, chêne, sapin, pin, bouleau, érable, saule, peuplier, platane, tilleul, hêtre, cerisier, palmier, baobab, séquoia, bambou, fougère, mousse, lichen, champignon, buisson, herbe, fleur, rose, tulipe, marguerite, coquelicot, tournesol, lavande, jonquille, orchidée, lys, violette, muguet, pissenlit, trèfle, feuille, branche, racine, tronc, écorce, graine, pollen, soleil, lune, étoile, nuage, pluie, orage, éclair, tonnerre, neige, grêle, brouillard, brume, vent, tempête, ouragan, tornade, arc-en-ciel, aurore, crépuscule, saison, printemps, été, automne, hiver, rosée, givre, verglas, avalanche, séisme, tsunami',
  'Corps humain': 'tête, cheveu, crâne, front, sourcil, cil, paupière, œil, pupille, iris, nez, narine, joue, bouche, lèvre, langue, dent, gencive, menton, mâchoire, oreille, tympan, cou, nuque, gorge, épaule, bras, coude, avant-bras, poignet, main, paume, doigt, pouce, index, ongle, poitrine, dos, ventre, nombril, hanche, taille, fesse, jambe, cuisse, genou, mollet, cheville, talon, pied, orteil, peau, muscle, os, squelette, colonne vertébrale, côte, bassin, fémur, tibia, cerveau, cœur, poumon, foie, rein, estomac, intestin, vessie, pancréas, rate, sang, veine, artère, nerf, tendon, ligament, articulation, cartilage, hormone, globule, neurone, poil, barbe, moustache, empreinte, sueur, larme, salive, souffle, pouls, squelette',
  'Vêtements': 't-shirt, chemise, chemisier, polo, pull, gilet, sweat, veste, blouson, manteau, doudoune, imperméable, parka, costume, cravate, nœud papillon, pantalon, jean, short, bermuda, jupe, robe, salopette, combinaison, survêtement, legging, pyjama, peignoir, maillot de bain, chaussette, collant, culotte, caleçon, slip, soutien-gorge, débardeur, chaussure, basket, sandale, tong, botte, bottine, escarpin, mocassin, pantoufle, chausson, ceinture, bretelle, écharpe, foulard, châle, gant, moufle, bonnet, casquette, chapeau, béret, capuche, cagoule, lunettes, montre, bracelet, collier, bague, boucle d\'oreille, broche, sac à main, sac à dos, portefeuille, parapluie, kimono, sari, tunique, poncho, kilt, tablier, uniforme, smoking, bouton, fermeture éclair, poche, col, manche, ourlet, couture',
  'Transports': 'voiture, camion, camionnette, bus, autocar, tramway, métro, train, tgv, locomotive, wagon, moto, scooter, vélo, trottinette, skateboard, taxi, ambulance, dépanneuse, tracteur, pelleteuse, bulldozer, grue, bétonnière, avion, hélicoptère, planeur, montgolfière, dirigeable, fusée, navette, satellite, bateau, voilier, paquebot, ferry, cargo, péniche, chalutier, yacht, canot, barque, pirogue, radeau, sous-marin, porte-avions, jet-ski, catamaran, téléphérique, télésiège, funiculaire, monorail, calèche, charrette, traîneau, quad, limousine, cabriolet, autoroute, carrefour, rond-point, parking, gare, aéroport, port, station, péage, feu rouge, panneau, permis, volant, pneu, moteur, essence, batterie, frein, klaxon, rétroviseur, ceinture, passager, billet',
  'Musique': 'guitare, basse, batterie, piano, clavier, synthétiseur, violon, alto, violoncelle, contrebasse, harpe, flûte, clarinette, hautbois, basson, saxophone, trompette, trombone, tuba, cor, cornemuse, accordéon, harmonica, ukulélé, banjo, mandoline, xylophone, triangle, tambour, timbale, cymbale, djembé, maracas, castagnettes, orgue, sitar, kalimba, note, portée, clé de sol, partition, mélodie, harmonie, rythme, tempo, mesure, accord, gamme, octave, solfège, refrain, couplet, chanson, album, concert, festival, orchestre, chorale, groupe, chanteur, soliste, chef d\'orchestre, compositeur, micro, amplificateur, enceinte, casque, vinyle, platine, rock, jazz, blues, reggae, rap, électro, techno, classique, opéra, funk, disco, métal, punk, country, soul, pop, chiptune, karaoké, symphonie',
  'Sciences et espace': 'atome, molécule, électron, proton, neutron, noyau, quark, photon, énergie, gravité, magnétisme, électricité, lumière, chaleur, vitesse, accélération, masse, force, pression, température, volume, densité, onde, fréquence, laser, aimant, circuit, batterie, réaction, oxygène, hydrogène, carbone, azote, hélium, fer, cuivre, or, argent, uranium, plutonium, acide, cellule, gène, adn, protéine, bactérie, virus, microbe, vaccin, évolution, fossile, dinosaure, écosystème, photosynthèse, microscope, télescope, laboratoire, expérience, hypothèse, théorie, équation, formule, algèbre, géométrie, triangle, cercle, pyramide, cube, sphère, fraction, pourcentage, statistique, univers, galaxie, nébuleuse, étoile, soleil, planète, mercure, vénus, terre, mars, jupiter, saturne, uranus, neptune, pluton, lune, astéroïde, comète, météorite, trou noir, supernova, constellation, orbite, satellite, fusée, astronaute, cosmonaute, apesanteur, voie lactée, exoplanète, big bang, éclipse, quasar, pulsar, rover, station spatiale',
  'Jeux vidéo et informatique': 'ordinateur, clavier, souris, écran, manette, console, joystick, casque, micro, webcam, processeur, carte graphique, mémoire, disque dur, clé usb, câble, routeur, wifi, internet, navigateur, onglet, site, serveur, réseau, logiciel, application, programme, code, algorithme, variable, fonction, boucle, bug, compilateur, terminal, fichier, dossier, sauvegarde, téléchargement, mise à jour, mot de passe, pirate, virus, antivirus, pare-feu, cryptage, robot, intelligence artificielle, pixel, sprite, niveau, boss, quête, inventaire, personnage, avatar, joueur, partie, score, record, vie, bonus, combo, sauvegarde, checkpoint, multijoueur, coopération, classement, tournoi, streaming, plateforme, arcade, rétro, simulation, stratégie, aventure, énigme, labyrinthe, donjon, dragon, épée, bouclier, potion, trésor, coffre, carte, mission, succès, trophée, manette, émulateur, cartouche, borne, écran titre, pause, game over, pseudo, discord, serveur, emoji, smartphone, tablette, imprimante, scanner, batterie, chargeur',
  'Animes et mangas': 'manga, anime, mangaka, otaku, shonen, shojo, seinen, isekai, mecha, chibi, kawaii, senpai, sensei, ninja, samouraï, shinigami, yokai, kitsune, katana, chakra, haki, quirk, titan, démon, chasseur, pirate, alchimiste, naruto, sasuke, sakura, kakashi, itachi, madara, gaara, hinata, jiraiya, luffy, zoro, nami, sanji, usopp, chopper, robin, franky, brook, shanks, ace, goku, vegeta, gohan, piccolo, freezer, cell, trunks, bulma, eren, mikasa, armin, livai, ichigo, rukia, tanjiro, nezuko, zenitsu, inosuke, rengoku, gojo, itadori, megumi, sukuna, deku, bakugo, todoroki, all might, light, ryuk, gon, killua, kurapika, hisoka, saitama, genos, edward, alphonse, spike, totoro, chihiro, shinji, asuka, rem, emilia, subaru, kirito, asuna, frieren, himmel, anya, loid, yor, denji, makima, pochita, conan, kenshin, sailor moon, pikachu, sangoku, astro boy, goldorak, albator, cobra, nicky larson, hokuto, kenshiro, berserk, guts, haikyu, hinata, kageyama, jojo, dio, inuyasha, kagome, lelouch, mob, reigen, violet, kaguya, chainsaw, bleach, evangelion, one piece, dragon ball, death note',
  'Mots difficiles': 'anticonstitutionnellement, kaléidoscope, xylophone, rhododendron, chrysanthème, hippopotame, ornithorynque, onomatopée, paradoxe, hypothèse, labyrinthe, métamorphose, rhinocéros, psychologie, pneumatique, gymnastique, symphonie, quintessence, zygomatique, acupuncture, ambidextre, apocalypse, archipel, baccalauréat, cacophonie, catastrophe, chlorophylle, cybernétique, dithyrambique, éphémère, épiphanie, équinoxe, euphorie, exubérant, fluorescent, hiéroglyphe, hémisphère, idiosyncrasie, ichtyologie, jurisprudence, kangourou, kilomètre, lyophilisé, magnanime, mnémotechnique, nonchalance, oxymore, palimpseste, péripétie, perpendiculaire, philanthrope, pharaon, physique, polyglotte, prestidigitateur, pyjama, quadrilatère, quiproquo, rocambolesque, sarcophage, sérendipité, sphinx, stéthoscope, subterfuge, synecdoque, tergiverser, thermomètre, tohu-bohu, transhumance, ubiquité, vraisemblable, wagon, whisky, xénophobe, yaourt, zéphyr, zodiaque, saxophone, rythme, abracadabrant, alambiqué, amphithéâtre, anachronisme, arc-en-ciel, bibliothèque, bourgeon, calligraphie, capharnaüm, chorégraphie, circonférence, désoxyribonucléique, dichotomie, effervescent, ellipse, encyclopédie, entrepreneur, fantasmagorie, gargouille, hétéroclite, hippocampe, inextricable, intransigeant, kayak, labyrinthique, mythologie, nénuphar, obsolète, orthographe, parallélépipède, pharmacie, philosophie, phosphorescent, protubérance, pseudonyme, quatuor, rhétorique, scaphandre, schizophrène, spaghetti, taxidermie, trapèze, vertigineux, yacht',
};
const WORD_THEMES = Object.keys(WORDS);
const wordList = theme => [...new Set(WORDS[theme].split(',').map(w => w.trim()).filter(Boolean))];
const wordPlain = w => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toUpperCase();  // the letters to guess / to find
console.assert(WORD_THEMES.every(t => wordList(t).length >= 50), 'WORDS: every theme has plenty of words');

const anyOf = a => a[Math.floor(Math.random() * a.length)];
const shuffled = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

const themeOptions = sel => sel.replaceChildren(el('option', '', 'Tous les thèmes'), ...WORD_THEMES.map(t => { const o = el('option', '', t); o.value = t; return o; }));

themeOptions($('hgTheme')); $('hgTheme').options[0].value = '';

/* ---------- Pendu: themed French words, accents ignored when guessing, a pixel gallows drawn step by step ---------- */
const HG_LEVELS = {facile: {max: 10, min: 4, maxLen: 8, ends: true}, normal: {max: 8, min: 4, maxLen: 30, ends: false}, difficile: {max: 6, min: 7, maxLen: 30, ends: false}, expert: {max: 4, min: 8, maxLen: 30, ends: false}};
let hg = null;
function hgNew() {
  const lv = HG_LEVELS[$('hgLevel').value], theme = $('hgTheme').value;
  const pool = (theme ? [theme] : WORD_THEMES).flatMap(t => wordList(t).map(w => [w, t]))
    .filter(([w]) => { const n = wordPlain(w).replace(/[^A-Z]/g, '').length; return n >= lv.min && n <= lv.maxLen; });
  const [word, t] = anyOf(pool), plain = wordPlain(word);
  hg = {word, plain, theme: t, lv, guessed: new Set(), wrong: 0, done: false};
  if (lv.ends) { hg.guessed.add(plain.match(/[A-Z]/)[0]); hg.guessed.add(plain.match(/[A-Z](?=[^A-Z]*$)/)[0]); }
  hgRender();
}
const hgMissing = () => [...new Set(hg.plain.replace(/[^A-Z]/g, ''))].filter(c => !hg.guessed.has(c));
function hgGuess(c) {
  if (!hg || hg.done || hg.guessed.has(c)) return;
  hg.guessed.add(c);
  if (!hg.plain.includes(c)) { hg.wrong++; sfx('error'); } else sfx('click');
  const st = gstore('hang', {won: 0, lost: 0, streak: 0});
  if (!hgMissing().length) { hg.done = 'won'; st.won++; st.streak++; best('hangStreak', st.streak); saveGames(); sfx('notify'); }
  else if (hg.wrong >= hg.lv.max) { hg.done = 'lost'; st.lost++; st.streak = 0; saveGames(); }
  hgRender();
}
function hgDraw() {  // 64 x 64 pixels; the drawing advances with the share of errors used, whatever the level
  const g = $('hgCanvas').getContext('2d'), k = Math.ceil(hg.wrong / hg.lv.max * 9 - 1e-9);
  g.fillStyle = '#0b031c'; g.fillRect(0, 0, 64, 64);
  const r = seeded(7); for (let i = 0; i < 26; i++) px(g, i % 3 ? '#2a1d52' : '#5e4d85', Math.floor(r() * 64), Math.floor(r() * 50));  // stars
  px(g, '#2b2468', 0, 56, 64, 8); px(g, '#3a2a6e', 0, 56, 64, 1);
  const wood = '#b8641c', dark = '#7a3c10', skin = hg.done === 'won' ? '#8ee8a0' : '#d9c6ff';
  if (k >= 1) { px(g, dark, 6, 53, 26, 3); px(g, wood, 6, 53, 26, 1); }
  if (k >= 2) { px(g, dark, 12, 8, 4, 45); px(g, wood, 12, 8, 1, 45); }
  if (k >= 3) { px(g, dark, 12, 6, 30, 4); px(g, wood, 12, 6, 30, 1); for (let i = 0; i < 8; i++) px(g, dark, 16 + i, 17 - i, 2, 2); }
  if (k >= 4) px(g, '#c9bdf0', 38, 10, 1, 8);
  const x = 38, y = 18;
  if (k >= 5) { px(g, '#3e0f4a', x - 4, y, 9, 9); px(g, skin, x - 3, y + 1, 7, 7); if (hg.done === 'lost') { px(g, '#3e0f4a', x - 2, y + 3); px(g, '#3e0f4a', x + 2, y + 3); } else { px(g, '#130a20', x - 2, y + 3, 1, 2); px(g, '#130a20', x + 2, y + 3, 1, 2); } }
  if (k >= 6) px(g, skin, x - 1, y + 9, 3, 12);
  if (k >= 7) for (let i = 0; i < 6; i++) { px(g, skin, x - 2 - i, y + 11 + i); px(g, skin, x + 2 + i, y + 11 + i); }
  if (k >= 8) for (let i = 0; i < 8; i++) px(g, skin, x - 1 - Math.floor(i / 2), y + 21 + i);
  if (k >= 9) for (let i = 0; i < 8; i++) px(g, skin, x + 1 + Math.floor(i / 2), y + 21 + i);
}
function hgRender() {
  const st = gstore('hang', {won: 0, lost: 0, streak: 0}), show = hg.done === 'lost';
  $('hgWord').replaceChildren(...[...hg.word].map((ch, i) => {
    const p = hg.plain[i];
    if (!/[A-Z]/.test(p)) return el('span', 'sep', ch === ' ' ? ' ' : ch);
    return el('span', hg.guessed.has(p) ? 'on' : show ? 'miss' : '', hg.guessed.has(p) || show ? ch.toUpperCase() : ' ');
  }));
  $('hgThemeName').textContent = 'Thème : ' + hg.theme;
  $('hgLives').textContent = 'Erreurs : ' + hg.wrong + ' / ' + hg.lv.max;
  $('hgMsg').textContent = hg.done === 'won' ? 'Bravo ! Série de ' + st.streak : hg.done === 'lost' ? 'Perdu… le mot était « ' + hg.word + ' »' : '';
  $('hgMsg').className = 'hgMsg ' + (hg.done || '');
  $('hgInfo').textContent = st.won + ' gagnés · ' + st.lost + ' perdus · série ' + st.streak + ' · meilleure série ' + (games.best.hangStreak ?? 0);
  $('hgKeys').replaceChildren(...['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'].map(row => {
    const r = el('div', 'hgRow');
    for (const c of row) { const b = el('button', 'hgKey px' + (hg.guessed.has(c) ? (hg.plain.includes(c) ? ' good' : ' bad') : ''), c); b.disabled = hg.guessed.has(c) || !!hg.done; b.onclick = () => hgGuess(c); r.append(b); }
    return r;
  }));
  $('hgHint').disabled = !!hg.done || hg.wrong >= hg.lv.max - 1;
  hgDraw();
}
$('hgNew').onclick = hgNew;
$('hgLevel').onchange = $('hgTheme').onchange = hgNew;
$('hgHint').onclick = () => { if (hg.done || hg.wrong >= hg.lv.max - 1) return; hg.wrong++; hgGuess(anyOf(hgMissing())); };  // a letter of the word, for one error

document.addEventListener('keydown', e => {
  if (!view.classList.contains('on') || !hg || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.altKey) return;
  if (e.key === 'Enter' && hg.done) return hgNew();
  const c = wordPlain(e.key); if (/^[A-Z]$/.test(c)) hgGuess(c);
});  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { hg ? hgRender() : hgNew(); });
}
