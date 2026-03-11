# Espace vocalique F1–F2 — Tracker en temps réel

## Présentation

Cette application web capture le signal audio du microphone en temps réel et en extrait les deux premiers formants (F1 et F2) pour placer un point dans un diagramme d'espace vocalique. Elle permet aux étudiants en phonétique de visualiser comment le placement de la langue et la configuration du conduit vocal produisent des résonances différentes.

L'application prédit également la voyelle la plus probable (symbole IPA) en comparant les formants mesurés à un inventaire de référence couvrant le français et l'anglais.

---

## Fonctionnement technique

### Capture audio

Le signal est capté via l'API `MediaDevices.getUserMedia()` avec les traitements automatiques désactivés (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`) afin de préserver le spectre naturel de la voix. Le taux d'échantillonnage est fixé à 16 kHz, suffisant pour l'analyse des formants vocaliques (F1 et F2 se situent typiquement sous 3 000 Hz).

### Extraction des formants par LPC

L'analyse repose sur la **prédiction linéaire** (Linear Predictive Coding, LPC) :

1. **Pré-accentuation** : un filtre de premier ordre (coefficient 0.97) amplifie les hautes fréquences pour compenser la pente spectrale naturelle de la voix.
2. **Fenêtrage de Hamming** : la trame audio est multipliée par une fenêtre de Hamming pour réduire les effets de bord.
3. **Autocorrélation** : les coefficients d'autocorrélation sont calculés sur la trame fenêtrée.
4. **Levinson-Durbin** : cet algorithme résout le système de Toeplitz pour obtenir les coefficients du filtre LPC (ordre ≈ `sampleRate/1000 + 4`).
5. **Recherche de racines** : les racines du polynôme LPC sont trouvées par la méthode de Durand-Kerner. Les racines à partie imaginaire positive, de magnitude entre 0.6 et 1.0 et de bande passante < 600 Hz, sont retenues comme candidats formantiques.
6. **Tri** : les formants sont triés par fréquence croissante ; F1 et F2 correspondent aux deux premières valeurs.

Un **lissage exponentiel** (α = 0.35) est appliqué aux valeurs F1/F2 successives pour éviter les sauts erratiques.

### Prédiction de la voyelle

La voyelle la plus proche est déterminée par **distance euclidienne normalisée** dans l'espace F1/F2, avec une pondération légèrement supérieure sur F1 (facteur 1.2) car les distinctions d'aperture sont souvent perceptuellement plus saillantes.

---

## Valeurs de référence F1/F2

### Français (voyelles orales)

Les valeurs de référence pour le français sont dérivées de deux sources principales :

- **Calliope (1989)**. *La parole et son traitement automatique*. Paris : Masson. — Ouvrage de référence contenant des moyennes formantiques pour les voyelles du français standard, mesurées sur des locuteurs adultes masculins et féminins.
- **Gendrot, C. & Adda-Decker, M. (2005)**. « Impact of duration on F1/F2 formant values of oral vowels: an automatic analysis of large broadcast news corpora in French and German. » *Proceedings of Interspeech 2005*, Lisbonne. — Étude sur corpus large fournissant des mesures moyennes en parole continue.

Les valeurs utilisées dans l'application représentent des **moyennes arrondies entre ces sources**, centrées sur un locuteur adulte « neutre » (ni spécifiquement masculin ni féminin).

| Voyelle | F1 (Hz) | F2 (Hz) |
|---------|---------|---------|
| /i/     | 280     | 2250    |
| /y/     | 280     | 1900    |
| /e/     | 370     | 2100    |
| /ø/     | 370     | 1700    |
| /ɛ/     | 530     | 1850    |
| /œ/     | 530     | 1550    |
| /a/     | 750     | 1400    |
| /ɑ/     | 750     | 1100    |
| /ɔ/     | 500     | 900     |
| /o/     | 380     | 850     |
| /u/     | 310     | 750     |
| /ə/     | 500     | 1400    |

### Anglais (General American)

Les valeurs pour l'anglais américain général proviennent de :

- **Peterson, G. E. & Barney, H. L. (1952)**. « Control methods used in a study of the vowels. » *Journal of the Acoustical Society of America*, 24(2), 175–184. — Étude fondatrice avec des mesures sur 76 locuteurs (hommes, femmes, enfants).
- **Hillenbrand, J., Getty, L. A., Clark, M. J. & Wheeler, K. (1995)**. « Acoustic characteristics of American English vowels. » *Journal of the Acoustical Society of America*, 97(5), 3099–3111. — Réplication et extension de Peterson & Barney avec 139 locuteurs et des méthodes d'analyse plus modernes.

Les valeurs utilisées sont des **moyennes arrondies tous genres confondus** issues principalement de Hillenbrand et al., avec ajustements ponctuels d'après Peterson & Barney.

| Voyelle | F1 (Hz) | F2 (Hz) | Exemple     |
|---------|---------|---------|-------------|
| /iː/   | 270     | 2290    | *heed*      |
| /ɪ/    | 390     | 1990    | *hid*       |
| /eɪ/   | 380     | 2080    | *hayed*     |
| /ɛ/    | 530     | 1840    | *head*      |
| /æ/    | 660     | 1720    | *had*       |
| /ɑː/  | 730     | 1090    | *hod*       |
| /ɔː/  | 570     | 840     | *hawed*     |
| /oʊ/   | 380     | 940     | *hoed*      |
| /ʊ/    | 440     | 1020    | *hood*      |
| /uː/  | 300     | 870     | *who'd*     |
| /ʌ/    | 640     | 1190    | *hud*       |
| /ɝ/    | 470     | 1380    | *heard*     |
| /ə/    | 500     | 1400    | *about*     |

---

## Discussion méthodologique : le problème de la normalisation

### Le problème

Les valeurs de référence ci-dessus sont exprimées en **Hertz bruts**. Or, les fréquences des formants dépendent directement de la **longueur du conduit vocal** du locuteur, qui varie selon le sexe, l'âge et la morphologie individuelle :

- Un homme adulte typique a un conduit vocal d'environ 17 cm, ce qui produit des formants relativement bas.
- Une femme adulte a un conduit vocal d'environ 14,5 cm : ses formants sont en moyenne **15–20 % plus élevés** que ceux d'un homme pour la même voyelle.
- Un enfant de 10 ans a un conduit d'environ 12 cm : formants encore plus hauts, parfois **40–50 % au-dessus** des valeurs masculines adultes.

Concrètement, cela signifie qu'une étudiante avec une voix aiguë et un étudiant avec une voix grave produisant la même voyelle /a/ verront des points très éloignés sur le diagramme, alors que leur articulation est identique. Le système pourrait même prédire des voyelles différentes pour une production articulatoirement équivalente.

### Deux solutions proposées

L'application offre deux approches complémentaires pour gérer ce problème. L'utilisateur choisit celle qui convient à son contexte.

#### Option 1 : Préréglage par tessiture (rapide)

L'utilisateur sélectionne « Voix grave » ou « Voix aiguë ». L'application applique un **facteur d'échelle uniforme** aux valeurs de référence F1 et F2 pour les rapprocher de la plage formantique attendue du locuteur.

Les facteurs d'échelle sont dérivés des moyennes par sexe rapportées par Hillenbrand et al. (1995), exprimées relativement à une moyenne tous genres confondus :

| Préréglage   | Facteur F1 | Facteur F2 | Logique                                    |
|-------------|-----------|-----------|---------------------------------------------|
| Voix grave  | ×0.85     | ×0.88     | Conduit vocal plus long → formants plus bas |
| Voix aiguë  | ×1.17     | ×1.14     | Conduit vocal plus court → formants plus hauts |

L'échelle de l'axe du diagramme est également ajustée pour s'adapter à la plage de valeurs attendue.

**Avantages** : aucune calibration nécessaire, instantané, intuitif en contexte de classe.

**Inconvénients** : approximation grossière. Un facteur linéaire uniforme ne capture pas les différences non linéaires entre locuteurs (la relation entre longueur du conduit vocal et formants n'est pas strictement proportionnelle sur tout le spectre). De plus, le choix « grave/aigu » est binaire alors que les voix existent sur un continuum.

#### Option 2 : Calibration de Lobanov (précise)

L'utilisateur produit trois voyelles cardinales (/i/, /a/, /u/) qui définissent les extrêmes de son espace vocalique personnel. L'application calcule alors la **moyenne** et l'**écart-type** de ses formants, puis transforme toutes les mesures en scores z ramenés à un espace canonique :

```
F_normalisé = μ_cible + ((F_brut - μ_locuteur) / σ_locuteur) × σ_cible
```

où μ\_cible et σ\_cible sont les paramètres d'un locuteur « canonique » moyen.

**Référence** : Lobanov, B. M. (1971). « Classification of Russian vowels spoken by different speakers. » *Journal of the Acoustical Society of America*, 49(2B), 606–608.

**Avantages** : normalisation spécifique au locuteur, bien validée dans la littérature (Adank, Smits & van Hout, 2004 — « A comparison of vowel normalization procedures for language variation research »). Efficace avec seulement 3 voyelles.

**Inconvénients** : nécessite une étape de calibration (~10 secondes), les voyelles doivent être produites de manière stable, et la calibration ne corrige pas les différences dialectales dans le placement des cibles.

### Quand utiliser quoi ?

| Contexte                                       | Recommandation          |
|------------------------------------------------|------------------------|
| Démonstration rapide en amphi                  | Préréglage tessiture    |
| TP individuel avec feedback précis             | Calibration Lobanov     |
| Comparaison entre locuteurs dans un même cours | Calibration Lobanov     |
| Exploration libre par les étudiants            | Préréglage tessiture    |
| Recherche ou analyse fine                      | Calibration Lobanov (ou utiliser Praat) |

### Alternatives non implémentées

D'autres méthodes de normalisation existent, chacune avec ses compromis :

- **Nearey (1978)** : transformation log-moyenne, préserve mieux les rapports entre formants. Adapté si l'on veut comparer des systèmes vocaliques entre langues.
- **Échelle Bark** : conversion psychoacoustique (Zwicker & Terhardt, 1980) qui compresse les hautes fréquences. Rapproche les espaces vocaliques entre locuteurs sans calibration individuelle, mais avec moins de précision que Lobanov.
- **Échelle ERB** (Equivalent Rectangular Bandwidth) : similaire au Bark, parfois préférée pour les voyelles proches.

### Limitations générales

- La calibration Lobanov par 3 voyelles est un minimum ; un protocole plus robuste utiliserait 5 à 7 voyelles couvrant l'ensemble de l'espace.
- Les voyelles de calibration doivent être produites de manière stable et tenue ; une production hésitante faussera les statistiques.
- Ni le préréglage ni Lobanov ne corrigent les différences dialectales ou idiolectales dans le placement des cibles vocaliques.
- L'analyse LPC dans le navigateur est sensible au bruit ambiant et à la qualité du microphone.
- Les diphtongues (/eɪ/, /oʊ/) ne sont représentées que par leur point de départ ; un suivi dynamique serait nécessaire pour les visualiser pleinement.

---

## Utilisation pédagogique

Quelques suggestions pour l'utilisation en classe :

- **Démonstration des voyelles cardinales** : montrer comment /i/, /a/, /u/ définissent les coins du trapèze vocalique.
- **Contraste français/anglais** : comparer les voyelles proches entre les deux langues (ex. /y/ français vs. absence en anglais, /æ/ anglais vs. /a/ français).
- **Effets de l'arrondissement** : observer comment /i/ → /y/ ou /e/ → /ø/ déplace F2 vers le bas sans modifier significativement F1.
- **Variabilité inter-locuteurs** : demander à plusieurs étudiants de produire la même voyelle sans normalisation, puis avec, pour montrer concrètement le problème et sa solution.
- **Coarticulation** : observer le mouvement du point entre deux voyelles dans un mot pour illustrer les transitions formantiques.
- **Comparer les deux normalisations** : basculer entre préréglage et Lobanov pour le même locuteur et observer les différences.

---

## Licence

Ce projet est mis à disposition librement à des fins pédagogiques.
