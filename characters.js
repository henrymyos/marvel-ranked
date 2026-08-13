// MCU hero and villain rosters, with portraits from the Marvel Cinematic
// Universe Wiki self-hosted under art/characters/.
// Regenerate with scripts/fetch-characters.mjs.
const HERO_GROUPS = {
  "Avengers": "#e05252",
  "Asgard": "#4a86e8",
  "Guardians": "#a05ce8",
  "Wakanda": "#2fb6a8",
  "Street Level": "#ef9f43",
  "New Blood": "#46b17b",
  "Mutants & F4": "#d9a53b",
  "S.H.I.E.L.D.": "#8a8781"
};

const HEROES = [
  {
    "name": "Iron Man",
    "actor": "Robert Downey Jr.",
    "group": "Avengers",
    "img": "art/characters/iron-man.webp"
  },
  {
    "name": "Captain America",
    "actor": "Chris Evans",
    "group": "Avengers",
    "img": "art/characters/captain-america.webp"
  },
  {
    "name": "Thor",
    "actor": "Chris Hemsworth",
    "group": "Asgard",
    "img": "art/characters/thor.webp"
  },
  {
    "name": "Hulk",
    "actor": "Mark Ruffalo",
    "group": "Avengers",
    "img": "art/characters/hulk.webp"
  },
  {
    "name": "Black Widow",
    "actor": "Scarlett Johansson",
    "group": "Avengers",
    "img": "art/characters/black-widow.webp"
  },
  {
    "name": "Hawkeye",
    "actor": "Jeremy Renner",
    "group": "Avengers",
    "img": "art/characters/hawkeye.webp"
  },
  {
    "name": "Nick Fury",
    "actor": "Samuel L. Jackson",
    "group": "S.H.I.E.L.D.",
    "img": "art/characters/nick-fury.webp"
  },
  {
    "name": "War Machine",
    "actor": "Don Cheadle",
    "group": "Avengers",
    "img": "art/characters/war-machine.webp"
  },
  {
    "name": "Falcon",
    "actor": "Anthony Mackie",
    "group": "Avengers",
    "img": "art/characters/falcon.webp"
  },
  {
    "name": "Winter Soldier",
    "actor": "Sebastian Stan",
    "group": "Avengers",
    "img": "art/characters/winter-soldier.webp"
  },
  {
    "name": "Scarlet Witch",
    "actor": "Elizabeth Olsen",
    "group": "Avengers",
    "img": "art/characters/scarlet-witch.webp"
  },
  {
    "name": "Vision",
    "actor": "Paul Bettany",
    "group": "Avengers",
    "img": "art/characters/vision.webp"
  },
  {
    "name": "Ant-Man",
    "actor": "Paul Rudd",
    "group": "Avengers",
    "img": "art/characters/ant-man.webp"
  },
  {
    "name": "The Wasp",
    "actor": "Evangeline Lilly",
    "group": "Avengers",
    "img": "art/characters/the-wasp.webp"
  },
  {
    "name": "Spider-Man",
    "actor": "Tom Holland",
    "group": "Avengers",
    "img": "art/characters/spider-man.webp"
  },
  {
    "name": "Doctor Strange",
    "actor": "Benedict Cumberbatch",
    "group": "Avengers",
    "img": "art/characters/doctor-strange.webp"
  },
  {
    "name": "Wong",
    "actor": "Benedict Wong",
    "group": "Avengers",
    "img": "art/characters/wong.webp"
  },
  {
    "name": "Captain Marvel",
    "actor": "Brie Larson",
    "group": "Avengers",
    "img": "art/characters/captain-marvel.webp"
  },
  {
    "name": "Loki",
    "actor": "Tom Hiddleston",
    "group": "Asgard",
    "img": "art/characters/loki.webp"
  },
  {
    "name": "Valkyrie",
    "actor": "Tessa Thompson",
    "group": "Asgard",
    "img": "art/characters/valkyrie.webp"
  },
  {
    "name": "Sylvie",
    "actor": "Sophia Di Martino",
    "group": "Asgard",
    "img": "art/characters/sylvie.webp"
  },
  {
    "name": "Star-Lord",
    "actor": "Chris Pratt",
    "group": "Guardians",
    "img": "art/characters/star-lord.webp"
  },
  {
    "name": "Gamora",
    "actor": "Zoe Saldaña",
    "group": "Guardians",
    "img": "art/characters/gamora.webp"
  },
  {
    "name": "Rocket",
    "actor": "Bradley Cooper",
    "group": "Guardians",
    "img": "art/characters/rocket.webp"
  },
  {
    "name": "Groot",
    "actor": "Vin Diesel",
    "group": "Guardians",
    "img": "art/characters/groot.webp"
  },
  {
    "name": "Drax",
    "actor": "Dave Bautista",
    "group": "Guardians",
    "img": "art/characters/drax.webp"
  },
  {
    "name": "Nebula",
    "actor": "Karen Gillan",
    "group": "Guardians",
    "img": "art/characters/nebula.webp"
  },
  {
    "name": "Mantis",
    "actor": "Pom Klementieff",
    "group": "Guardians",
    "img": "art/characters/mantis.webp"
  },
  {
    "name": "Yondu",
    "actor": "Michael Rooker",
    "group": "Guardians",
    "img": "art/characters/yondu.webp"
  },
  {
    "name": "Black Panther",
    "actor": "Chadwick Boseman",
    "group": "Wakanda",
    "img": "art/characters/black-panther.webp"
  },
  {
    "name": "Shuri",
    "actor": "Letitia Wright",
    "group": "Wakanda",
    "img": "art/characters/shuri.webp"
  },
  {
    "name": "Okoye",
    "actor": "Danai Gurira",
    "group": "Wakanda",
    "img": "art/characters/okoye.webp"
  },
  {
    "name": "Daredevil",
    "actor": "Charlie Cox",
    "group": "Street Level",
    "img": "art/characters/daredevil.webp"
  },
  {
    "name": "The Punisher",
    "actor": "Jon Bernthal",
    "group": "Street Level",
    "img": "art/characters/the-punisher.webp"
  },
  {
    "name": "Jessica Jones",
    "actor": "Krysten Ritter",
    "group": "Street Level",
    "img": "art/characters/jessica-jones.webp"
  },
  {
    "name": "Luke Cage",
    "actor": "Mike Colter",
    "group": "Street Level",
    "img": "art/characters/luke-cage.webp"
  },
  {
    "name": "Iron Fist",
    "actor": "Finn Jones",
    "group": "Street Level",
    "img": "art/characters/iron-fist.webp"
  },
  {
    "name": "Moon Knight",
    "actor": "Oscar Isaac",
    "group": "Street Level",
    "img": "art/characters/moon-knight.webp"
  },
  {
    "name": "Shang-Chi",
    "actor": "Simu Liu",
    "group": "New Blood",
    "img": "art/characters/shang-chi.webp"
  },
  {
    "name": "Ms. Marvel",
    "actor": "Iman Vellani",
    "group": "New Blood",
    "img": "art/characters/ms-marvel.webp"
  },
  {
    "name": "She-Hulk",
    "actor": "Tatiana Maslany",
    "group": "New Blood",
    "img": "art/characters/she-hulk.webp"
  },
  {
    "name": "Yelena Belova",
    "actor": "Florence Pugh",
    "group": "New Blood",
    "img": "art/characters/yelena-belova.webp"
  },
  {
    "name": "Kate Bishop",
    "actor": "Hailee Steinfeld",
    "group": "New Blood",
    "img": "art/characters/kate-bishop.webp"
  },
  {
    "name": "Ironheart",
    "actor": "Dominique Thorne",
    "group": "New Blood",
    "img": "art/characters/ironheart.webp"
  },
  {
    "name": "Echo",
    "actor": "Alaqua Cox",
    "group": "New Blood",
    "img": "art/characters/echo.webp"
  },
  {
    "name": "America Chavez",
    "actor": "Xochitl Gomez",
    "group": "New Blood",
    "img": "art/characters/america-chavez.webp"
  },
  {
    "name": "Monica Rambeau",
    "actor": "Teyonah Parris",
    "group": "New Blood",
    "img": "art/characters/monica-rambeau.webp"
  },
  {
    "name": "U.S. Agent",
    "actor": "Wyatt Russell",
    "group": "New Blood",
    "img": "art/characters/u-s-agent.webp"
  },
  {
    "name": "Red Guardian",
    "actor": "David Harbour",
    "group": "New Blood",
    "img": "art/characters/red-guardian.webp"
  },
  {
    "name": "Deadpool",
    "actor": "Ryan Reynolds",
    "group": "Mutants & F4",
    "img": "art/characters/deadpool.webp"
  },
  {
    "name": "Wolverine",
    "actor": "Hugh Jackman",
    "group": "Mutants & F4",
    "img": "art/characters/wolverine.webp"
  },
  {
    "name": "Mister Fantastic",
    "actor": "Pedro Pascal",
    "group": "Mutants & F4",
    "img": "art/characters/mister-fantastic.webp"
  },
  {
    "name": "Invisible Woman",
    "actor": "Vanessa Kirby",
    "group": "Mutants & F4",
    "img": "art/characters/invisible-woman.webp"
  },
  {
    "name": "Human Torch",
    "actor": "Joseph Quinn",
    "group": "Mutants & F4",
    "img": "art/characters/human-torch.webp"
  },
  {
    "name": "The Thing",
    "actor": "Ebon Moss-Bachrach",
    "group": "Mutants & F4",
    "img": "art/characters/the-thing.webp"
  },
  {
    "name": "Peggy Carter",
    "actor": "Hayley Atwell",
    "group": "S.H.I.E.L.D.",
    "img": "art/characters/peggy-carter.webp"
  },
  {
    "name": "Phil Coulson",
    "actor": "Clark Gregg",
    "group": "S.H.I.E.L.D.",
    "img": "art/characters/phil-coulson.webp"
  }
];

const VILLAIN_GROUPS = {
  "Multiversal": "#e62429",
  "Avengers Foes": "#e05252",
  "Cosmic": "#a05ce8",
  "Mystic": "#3fb6c4",
  "Spider-Man Foes": "#4a86e8",
  "Street Level": "#ef9f43",
  "Rogues": "#46b17b"
};

const VILLAINS = [
  {
    "name": "Thanos",
    "actor": "Josh Brolin",
    "group": "Multiversal",
    "img": "art/characters/thanos.webp"
  },
  {
    "name": "Kang the Conqueror",
    "actor": "Jonathan Majors",
    "group": "Multiversal",
    "img": "art/characters/kang-the-conqueror.webp"
  },
  {
    "name": "He Who Remains",
    "actor": "Jonathan Majors",
    "group": "Multiversal",
    "img": "art/characters/he-who-remains.webp"
  },
  {
    "name": "Galactus",
    "actor": "Ralph Ineson",
    "group": "Multiversal",
    "img": "art/characters/galactus.webp"
  },
  {
    "name": "Doctor Doom",
    "actor": "Robert Downey Jr.",
    "group": "Multiversal",
    "img": "art/characters/doctor-doom.webp"
  },
  {
    "name": "Ultron",
    "actor": "James Spader",
    "group": "Avengers Foes",
    "img": "art/characters/ultron.webp"
  },
  {
    "name": "Red Skull",
    "actor": "Hugo Weaving",
    "group": "Avengers Foes",
    "img": "art/characters/red-skull.webp"
  },
  {
    "name": "Baron Zemo",
    "actor": "Daniel Brühl",
    "group": "Avengers Foes",
    "img": "art/characters/baron-zemo.webp"
  },
  {
    "name": "Alexander Pierce",
    "actor": "Robert Redford",
    "group": "Avengers Foes",
    "img": "art/characters/alexander-pierce.webp"
  },
  {
    "name": "Red Hulk",
    "actor": "Harrison Ford",
    "group": "Avengers Foes",
    "img": "art/characters/red-hulk.webp"
  },
  {
    "name": "Abomination",
    "actor": "Tim Roth",
    "group": "Avengers Foes",
    "img": "art/characters/abomination.webp"
  },
  {
    "name": "The Leader",
    "actor": "Tim Blake Nelson",
    "group": "Avengers Foes",
    "img": "art/characters/the-leader.webp"
  },
  {
    "name": "Iron Monger",
    "actor": "Jeff Bridges",
    "group": "Avengers Foes",
    "img": "art/characters/iron-monger.webp"
  },
  {
    "name": "Whiplash",
    "actor": "Mickey Rourke",
    "group": "Avengers Foes",
    "img": "art/characters/whiplash.webp"
  },
  {
    "name": "Aldrich Killian",
    "actor": "Guy Pearce",
    "group": "Avengers Foes",
    "img": "art/characters/aldrich-killian.webp"
  },
  {
    "name": "MODOK",
    "actor": "Corey Stoll",
    "group": "Avengers Foes",
    "img": "art/characters/modok.webp"
  },
  {
    "name": "Taskmaster",
    "actor": "Olga Kurylenko",
    "group": "Avengers Foes",
    "img": "art/characters/taskmaster.webp"
  },
  {
    "name": "Dreykov",
    "actor": "Ray Winstone",
    "group": "Avengers Foes",
    "img": "art/characters/dreykov.webp"
  },
  {
    "name": "Ghost",
    "actor": "Hannah John-Kamen",
    "group": "Avengers Foes",
    "img": "art/characters/ghost.webp"
  },
  {
    "name": "Valentina de Fontaine",
    "actor": "Julia Louis-Dreyfus",
    "group": "Avengers Foes",
    "img": "art/characters/valentina-de-fontaine.webp"
  },
  {
    "name": "Gravik",
    "actor": "Kingsley Ben-Adir",
    "group": "Avengers Foes",
    "img": "art/characters/gravik.webp"
  },
  {
    "name": "The Sentry",
    "actor": "Lewis Pullman",
    "group": "Avengers Foes",
    "img": "art/characters/the-sentry.webp"
  },
  {
    "name": "Hela",
    "actor": "Cate Blanchett",
    "group": "Cosmic",
    "img": "art/characters/hela.webp"
  },
  {
    "name": "Malekith",
    "actor": "Christopher Eccleston",
    "group": "Cosmic",
    "img": "art/characters/malekith.webp"
  },
  {
    "name": "Gorr the God Butcher",
    "actor": "Christian Bale",
    "group": "Cosmic",
    "img": "art/characters/gorr-the-god-butcher.webp"
  },
  {
    "name": "Ronan the Accuser",
    "actor": "Lee Pace",
    "group": "Cosmic",
    "img": "art/characters/ronan-the-accuser.webp"
  },
  {
    "name": "Ego",
    "actor": "Kurt Russell",
    "group": "Cosmic",
    "img": "art/characters/ego.webp"
  },
  {
    "name": "High Evolutionary",
    "actor": "Chukwudi Iwuji",
    "group": "Cosmic",
    "img": "art/characters/high-evolutionary.webp"
  },
  {
    "name": "Arishem",
    "actor": "David Kaye",
    "group": "Cosmic",
    "img": "art/characters/arishem.webp"
  },
  {
    "name": "Ikaris",
    "actor": "Richard Madden",
    "group": "Cosmic",
    "img": "art/characters/ikaris.webp"
  },
  {
    "name": "Dormammu",
    "actor": "Benedict Cumberbatch",
    "group": "Mystic",
    "img": "art/characters/dormammu.webp"
  },
  {
    "name": "Kaecilius",
    "actor": "Mads Mikkelsen",
    "group": "Mystic",
    "img": "art/characters/kaecilius.webp"
  },
  {
    "name": "Agatha Harkness",
    "actor": "Kathryn Hahn",
    "group": "Mystic",
    "img": "art/characters/agatha-harkness.webp"
  },
  {
    "name": "Arthur Harrow",
    "actor": "Ethan Hawke",
    "group": "Mystic",
    "img": "art/characters/arthur-harrow.webp"
  },
  {
    "name": "Mephisto",
    "actor": "Sacha Baron Cohen",
    "group": "Mystic",
    "img": "art/characters/mephisto.webp"
  },
  {
    "name": "Green Goblin",
    "actor": "Willem Dafoe",
    "group": "Spider-Man Foes",
    "img": "art/characters/green-goblin.webp"
  },
  {
    "name": "Doctor Octopus",
    "actor": "Alfred Molina",
    "group": "Spider-Man Foes",
    "img": "art/characters/doctor-octopus.webp"
  },
  {
    "name": "Vulture",
    "actor": "Michael Keaton",
    "group": "Spider-Man Foes",
    "img": "art/characters/vulture.webp"
  },
  {
    "name": "Mysterio",
    "actor": "Jake Gyllenhaal",
    "group": "Spider-Man Foes",
    "img": "art/characters/mysterio.webp"
  },
  {
    "name": "Electro",
    "actor": "Jamie Foxx",
    "group": "Spider-Man Foes",
    "img": "art/characters/electro.webp"
  },
  {
    "name": "Kingpin",
    "actor": "Vincent D'Onofrio",
    "group": "Street Level",
    "img": "art/characters/kingpin.webp"
  },
  {
    "name": "Bullseye",
    "actor": "Wilson Bethel",
    "group": "Street Level",
    "img": "art/characters/bullseye.webp"
  },
  {
    "name": "Kilgrave",
    "actor": "David Tennant",
    "group": "Street Level",
    "img": "art/characters/kilgrave.webp"
  },
  {
    "name": "Killmonger",
    "actor": "Michael B. Jordan",
    "group": "Rogues",
    "img": "art/characters/killmonger.webp"
  },
  {
    "name": "Namor",
    "actor": "Tenoch Huerta",
    "group": "Rogues",
    "img": "art/characters/namor.webp"
  },
  {
    "name": "Xu Wenwu",
    "actor": "Tony Leung",
    "group": "Rogues",
    "img": "art/characters/xu-wenwu.webp"
  },
  {
    "name": "Cassandra Nova",
    "actor": "Emma Corrin",
    "group": "Rogues",
    "img": "art/characters/cassandra-nova.webp"
  }
];

// Portrait lookup by name, for the share-card renderer.
const CHARACTER_ART = Object.fromEntries([...HEROES, ...VILLAINS].map((c) => [c.name, c.img]));
