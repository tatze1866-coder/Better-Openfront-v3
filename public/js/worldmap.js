// Stilisierte Weltkarten-Daten: Kontinente als Polygone (Lon/Lat),
// Inseln als Ellipsen, Binnenmeere als Ausschnitte.
// Die Formen sind bewusst grob – beim Rastern (mapgen.js) sorgt Küsten-Rauschen
// für organische, pro Seed leicht unterschiedliche Küstenlinien.
//
// Koordinaten sind geografisch: Lon = Längengrad (-180..180, Ost positiv),
// Lat = Breitengrad (-90..90, Nord positiv). mapgen.js rechnet diese je nach
// gewaehltem Kartenausschnitt (MAP_VIEWS) auf Pixel-Zellen um.

// Landflaechen. Zwei moegliche Formen:
//   poly:    Liste von [Lon, Lat]-Eckpunkten (Polygonzug des Kontinents)
//   ellipse: [Zentrum-Lon, Zentrum-Lat, Radius-Lon, Radius-Lat, Rotation°]
export const LAND_SHAPES = [
  { name: 'Nordamerika', poly: [[-168, 66], [-160, 70], [-150, 71], [-140, 70], [-128, 71], [-118, 73], [-105, 73], [-92, 72], [-84, 70], [-76, 73], [-68, 70], [-60, 62], [-55, 53], [-60, 47], [-67, 45], [-70, 43], [-74, 40], [-76, 37], [-80, 32], [-81, 26], [-84, 30], [-90, 30], [-94, 29], [-97, 26], [-97, 22], [-94, 18], [-88, 16], [-83, 10], [-80, 9], [-84, 12], [-91, 16], [-97, 17], [-104, 20], [-110, 24], [-115, 30], [-121, 35], [-124, 40], [-124, 46], [-128, 50], [-133, 55], [-140, 60], [-148, 61], [-153, 59], [-160, 56], [-166, 55], [-168, 60]] },
  { name: 'Grönland', poly: [[-58, 76], [-50, 80], [-40, 83], [-28, 83], [-20, 79], [-22, 73], [-30, 68], [-40, 60], [-46, 60], [-52, 64], [-56, 70]] },
  { name: 'Südamerika', poly: [[-80, 9], [-76, 11], [-71, 12], [-64, 11], [-60, 9], [-54, 6], [-50, 1], [-44, -2], [-38, -5], [-35, -9], [-39, -15], [-41, -22], [-48, -28], [-54, -34], [-58, -39], [-64, -41], [-66, -47], [-69, -52], [-69, -56], [-73, -53], [-74, -46], [-73, -38], [-71, -30], [-70, -22], [-72, -17], [-77, -12], [-81, -5], [-81, 1], [-78, 5]] },
  { name: 'Afrika', poly: [[-6, 35], [2, 37], [11, 37], [19, 33], [29, 32], [33, 29], [35, 24], [37, 20], [40, 15], [43, 11], [48, 11], [51, 12], [46, 3], [41, -3], [39, -11], [35, -19], [33, -26], [28, -33], [20, -35], [17, -33], [15, -27], [12, -18], [13, -11], [9, -2], [8, 4], [4, 6], [-2, 5], [-8, 4], [-13, 9], [-17, 14], [-17, 18], [-15, 22], [-13, 27], [-9, 31]] },
  { name: 'Europa', poly: [[-9, 36], [-8, 43], [-2, 44], [0, 46], [-4, 48], [-2, 50], [3, 51], [8, 54], [14, 54], [20, 54], [24, 57], [30, 59], [34, 56], [36, 50], [30, 46], [28, 41], [26, 38], [22, 37], [19, 40], [16, 38], [13, 38], [14, 42], [12, 44], [7, 43], [3, 42], [1, 39], [-2, 37]] },
  { name: 'Skandinavien', poly: [[6, 58], [5, 61], [8, 64], [12, 67], [17, 70], [24, 71], [29, 71], [31, 70], [27, 66], [24, 64], [21, 61], [17, 58], [12, 56], [8, 56]] },
  { name: 'Sibirien', poly: [[24, 56], [26, 62], [30, 70], [40, 68], [50, 70], [60, 71], [70, 73], [82, 75], [95, 76], [110, 75], [125, 73], [140, 72], [152, 70], [162, 68], [172, 67], [179, 66], [179, 63], [170, 62], [163, 60], [161, 55], [157, 52], [155, 57], [150, 60], [144, 58], [140, 52], [137, 47], [132, 44], [125, 42], [115, 42], [105, 44], [95, 45], [85, 46], [75, 44], [65, 44], [57, 44], [50, 45], [43, 47], [37, 49], [30, 52]] },
  { name: 'Naher Osten', poly: [[26, 36], [30, 38], [36, 38], [42, 39], [46, 40], [50, 38], [55, 38], [60, 36], [64, 33], [66, 28], [62, 25], [59, 22], [59, 17], [55, 15], [50, 12], [45, 12], [42, 17], [39, 21], [35, 27], [33, 31], [28, 32]] },
  { name: 'Indien', poly: [[67, 24], [70, 21], [72, 19], [76, 12], [78, 8], [81, 14], [85, 19], [88, 22], [90, 24], [87, 27], [82, 29], [75, 31], [70, 29]] },
  { name: 'China/Südostasien', poly: [[70, 35], [75, 40], [85, 44], [95, 44], [105, 42], [115, 41], [122, 40], [121, 32], [117, 24], [110, 19], [107, 13], [105, 9], [102, 7], [99, 11], [97, 17], [93, 21], [89, 24], [87, 28], [80, 31], [73, 33]] },
  { name: 'Australien', poly: [[114, -22], [113, -26], [115, -33], [118, -35], [124, -33], [130, -32], [135, -35], [138, -35], [140, -38], [146, -39], [150, -37], [153, -32], [153, -27], [151, -24], [146, -19], [143, -14], [142, -11], [137, -12], [135, -15], [132, -12], [129, -15], [125, -14], [122, -18]] },
  // Inseln (Ellipsen: [Zentrum-Lon, Zentrum-Lat, Radius-Lon, Radius-Lat, Rotation°])
  { name: 'Großbritannien', ellipse: [-2.5, 54, 2.4, 4.8, 15] },
  { name: 'Irland', ellipse: [-8, 53.3, 1.8, 1.9, 0] },
  { name: 'Island', ellipse: [-18.5, 65, 3.2, 1.6, 0] },
  { name: 'Japan-Nord', ellipse: [139, 38.5, 2, 4.5, 25] },
  { name: 'Japan-Süd', ellipse: [132.5, 33.5, 3.2, 1.4, 20] },
  { name: 'Madagaskar', ellipse: [47, -19.5, 2, 5.8, 10] },
  { name: 'Neuseeland-Nord', ellipse: [175, -38.5, 1.8, 3.2, 15] },
  { name: 'Neuseeland-Süd', ellipse: [170.5, -43.8, 1.8, 3.4, 30] },
  { name: 'Sumatra', ellipse: [101.5, -1, 6, 2, -38] },
  { name: 'Java', ellipse: [110.5, -7.3, 5.5, 1.1, -5] },
  { name: 'Borneo', ellipse: [114, 0.5, 4.6, 3.6, 0] },
  { name: 'Sulawesi', ellipse: [121, -2, 2.4, 2.4, 0] },
  { name: 'Neuguinea', ellipse: [141.5, -5.5, 9, 3, -8] },
  { name: 'Philippinen', ellipse: [122, 13, 2.4, 4.6, 20] },
  { name: 'Sri Lanka', ellipse: [80.8, 7.7, 1.1, 1.8, 0] },
  { name: 'Kuba', ellipse: [-79.5, 21.8, 5.2, 1.1, -12] },
  { name: 'Hispaniola', ellipse: [-71, 19, 3, 1.3, 0] },
  { name: 'Tasmanien', ellipse: [146.7, -42.2, 1.7, 1.5, 0] },
];

// Binnenmeere / Buchten, die aus den Landflächen ausgeschnitten werden
export const SEA_SHAPES = [
  { name: 'Hudson Bay', ellipse: [-85, 60, 7, 5, 0] },
  { name: 'Ostsee', ellipse: [19.5, 59, 3.2, 5, 35] },
  { name: 'Schwarzes Meer', ellipse: [34, 43, 7, 3, 0] },
  { name: 'Kaspisches Meer', ellipse: [51, 42, 3, 6, 10] },
  { name: 'Rotes Meer', ellipse: [38, 20.5, 2.2, 8.5, -54] },
  { name: 'Persischer Golf', ellipse: [51, 27, 3.4, 1.6, -25] },
];

// Kartenausschnitte (Lon/Lat-Bounding-Box) für die wählbaren Karten.
// Jeder Eintrag legt fest, welcher Weltausschnitt auf die Spielkarte gerastert
// wird – z.B. 'europe' zeigt nur den Bereich um Europa. 'random' (in engine.js)
// nutzt keine dieser Ansichten, sondern erzeugt zufaellige Inseln.
export const MAP_VIEWS = {
  world: { lon: [-180, 180], lat: [-56, 80] },
  europe: { lon: [-25, 45], lat: [34, 72] },
  africa: { lon: [-25, 55], lat: [-38, 38] },
  asia: { lon: [40, 150], lat: [-12, 75] },
  namerica: { lon: [-168, -45], lat: [5, 76] },
  samerica: { lon: [-90, -30], lat: [-58, 14] },
  australia: { lon: [108, 180], lat: [-50, 3] },
};
