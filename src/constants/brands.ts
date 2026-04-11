export const BRANDS = [
  "Nature Blessed",
  "Cry Baby Craigs",
  "Buon Giorno Italia",
  "Northstar Kombucha",
  "Taco Terco",
  "JoMomma's",
  "Sturdiwheat",
  "Big Watt Beverage",
  "Seven Bridges",
  "KenDavis",
  "Dinos",
  "Coloma Frozen Foods",
  "Mama Stoen's",
  "Smude",
  "Superior Water",
  "La Perla",
  "Skinny Sticks",
  "Calvin Cleo",
] as const;

export type Brand = (typeof BRANDS)[number];
