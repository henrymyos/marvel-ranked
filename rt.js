// Rotten Tomatoes scores scraped from each movie page's scorecard JSON.
// critics = Tomatometer %, audience = Popcornmeter %.
// Regenerate with scripts/fetch-rt.mjs.
const RT_SNAPSHOT = "2026-08-05";
const RT = {
  "Iron Man": {
    "critics": 94,
    "audience": 91,
    "slug": "iron_man"
  },
  "The Incredible Hulk": {
    "critics": 68,
    "audience": 69,
    "slug": "the_incredible_hulk"
  },
  "Iron Man 2": {
    "critics": 72,
    "audience": 71,
    "slug": "iron_man_2"
  },
  "Thor": {
    "critics": 77,
    "audience": 76,
    "slug": "thor"
  },
  "Captain America: The First Avenger": {
    "critics": 80,
    "audience": 75,
    "slug": "captain_america_the_first_avenger"
  },
  "The Avengers": {
    "critics": 91,
    "audience": 91,
    "slug": "marvels_the_avengers"
  },
  "Iron Man 3": {
    "critics": 79,
    "audience": 78,
    "slug": "iron_man_3"
  },
  "Thor: The Dark World": {
    "critics": 67,
    "audience": 74,
    "slug": "thor_the_dark_world"
  },
  "Captain America: The Winter Soldier": {
    "critics": 90,
    "audience": 92,
    "slug": "captain_america_the_winter_soldier"
  },
  "Guardians of the Galaxy": {
    "critics": 91,
    "audience": 92,
    "slug": "guardians_of_the_galaxy"
  },
  "Avengers: Age of Ultron": {
    "critics": 75,
    "audience": 82,
    "slug": "avengers_age_of_ultron"
  },
  "Ant-Man": {
    "critics": 83,
    "audience": 85,
    "slug": "ant_man"
  },
  "Captain America: Civil War": {
    "critics": 90,
    "audience": 89,
    "slug": "captain_america_civil_war"
  },
  "Doctor Strange": {
    "critics": 89,
    "audience": 86,
    "slug": "doctor_strange_2016"
  },
  "Guardians of the Galaxy Vol. 2": {
    "critics": 85,
    "audience": 87,
    "slug": "guardians_of_the_galaxy_vol_2"
  },
  "Spider-Man: Homecoming": {
    "critics": 92,
    "audience": 87,
    "slug": "spider_man_homecoming"
  },
  "Thor: Ragnarok": {
    "critics": 93,
    "audience": 87,
    "slug": "thor_ragnarok"
  },
  "Black Panther": {
    "critics": 96,
    "audience": 79,
    "slug": "black_panther_2018"
  },
  "Avengers: Infinity War": {
    "critics": 85,
    "audience": 92,
    "slug": "avengers_infinity_war"
  },
  "Ant-Man and the Wasp": {
    "critics": 87,
    "audience": 78,
    "slug": "ant_man_and_the_wasp"
  },
  "Captain Marvel": {
    "critics": 79,
    "audience": 45,
    "slug": "captain_marvel"
  },
  "Avengers: Endgame": {
    "critics": 94,
    "audience": 90,
    "slug": "avengers_endgame"
  },
  "Spider-Man: Far From Home": {
    "critics": 91,
    "audience": 95,
    "slug": "spider_man_far_from_home"
  },
  "Black Widow": {
    "critics": 79,
    "audience": 91,
    "slug": "black_widow_2021"
  },
  "Shang-Chi and The Legend of the Ten Rings": {
    "critics": 92,
    "audience": 98,
    "slug": "shang_chi_and_the_legend_of_the_ten_rings"
  },
  "Eternals": {
    "critics": 48,
    "audience": 77,
    "slug": "eternals"
  },
  "Spider-Man: No Way Home": {
    "critics": 93,
    "audience": 97,
    "slug": "spider_man_no_way_home"
  },
  "Doctor Strange in the Multiverse of Madness": {
    "critics": 73,
    "audience": 85,
    "slug": "doctor_strange_in_the_multiverse_of_madness"
  },
  "Thor: Love and Thunder": {
    "critics": 64,
    "audience": 76,
    "slug": "thor_love_and_thunder"
  },
  "Black Panther: Wakanda Forever": {
    "critics": 84,
    "audience": 93,
    "slug": "black_panther_wakanda_forever"
  },
  "Ant-Man and the Wasp: Quantumania": {
    "critics": 46,
    "audience": 81,
    "slug": "ant_man_and_the_wasp_quantumania"
  },
  "Guardians of the Galaxy Vol. 3": {
    "critics": 82,
    "audience": 94,
    "slug": "guardians_of_the_galaxy_vol_3"
  },
  "The Marvels": {
    "critics": 63,
    "audience": 79,
    "slug": "the_marvels"
  },
  "Deadpool and Wolverine": {
    "critics": 77,
    "audience": 94,
    "slug": "deadpool_and_wolverine"
  },
  "Captain America: Brave New World": {
    "critics": 46,
    "audience": 75,
    "slug": "captain_america_brave_new_world"
  },
  "Thunderbolts*": {
    "critics": 88,
    "audience": 93,
    "slug": "thunderbolts"
  },
  "The Fantastic Four: First Steps": {
    "critics": 86,
    "audience": 90,
    "slug": "the_fantastic_four_first_steps"
  },
  "Spider-Man: Brand New Day": {
    "critics": 90,
    "audience": 98,
    "slug": "spider_man_brand_new_day"
  }
};
