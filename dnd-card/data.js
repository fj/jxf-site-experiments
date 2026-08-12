/*
 * Player Card — the 2024 Player's Handbook (D&D 5.5E) reference tables.
 *
 * These populate the suggestion lists and drive the derived numbers: the six
 * abilities, the eighteen skills and which ability each keys off, and the
 * species / classes / subclasses / backgrounds of the 2024 PHB. The controls
 * that use them are plain text inputs backed by a <datalist>, so the official
 * options are one keystroke away and homebrew is still accepted; none of them
 * feeds arithmetic, which is why they can be anything at all.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  D.ABILITIES = [
    { key: "str", abbr: "STR", label: "Strength" },
    { key: "dex", abbr: "DEX", label: "Dexterity" },
    { key: "con", abbr: "CON", label: "Constitution" },
    { key: "int", abbr: "INT", label: "Intelligence" },
    { key: "wis", abbr: "WIS", label: "Wisdom" },
    { key: "cha", abbr: "CHA", label: "Charisma" }
  ];

  D.SKILLS = [
    { key: "acrobatics", label: "Acrobatics", ability: "dex" },
    { key: "animal-handling", label: "Animal Handling", ability: "wis" },
    { key: "arcana", label: "Arcana", ability: "int" },
    { key: "athletics", label: "Athletics", ability: "str" },
    { key: "deception", label: "Deception", ability: "cha" },
    { key: "history", label: "History", ability: "int" },
    { key: "insight", label: "Insight", ability: "wis" },
    { key: "intimidation", label: "Intimidation", ability: "cha" },
    { key: "investigation", label: "Investigation", ability: "int" },
    { key: "medicine", label: "Medicine", ability: "wis" },
    { key: "nature", label: "Nature", ability: "int" },
    { key: "perception", label: "Perception", ability: "wis" },
    { key: "performance", label: "Performance", ability: "cha" },
    { key: "persuasion", label: "Persuasion", ability: "cha" },
    { key: "religion", label: "Religion", ability: "int" },
    { key: "sleight-of-hand", label: "Sleight of Hand", ability: "dex" },
    { key: "stealth", label: "Stealth", ability: "dex" },
    { key: "survival", label: "Survival", ability: "wis" }
  ];

  D.SPECIES = [
    "Aasimar", "Dragonborn", "Dwarf", "Elf", "Gnome",
    "Goliath", "Halfling", "Human", "Orc", "Tiefling"
  ];

  D.BACKGROUNDS = [
    "Acolyte", "Artisan", "Charlatan", "Criminal", "Entertainer", "Farmer",
    "Guard", "Guide", "Hermit", "Merchant", "Noble", "Sage", "Sailor",
    "Scribe", "Soldier", "Wayfarer"
  ];

  D.CLASSES = [
    { name: "Barbarian", subclasses: ["Path of the Berserker", "Path of the Wild Heart", "Path of the World Tree", "Path of the Zealot"] },
    { name: "Bard", subclasses: ["College of Dance", "College of Glamour", "College of Lore", "College of Valor"] },
    { name: "Cleric", subclasses: ["Life Domain", "Light Domain", "Trickery Domain", "War Domain"] },
    { name: "Druid", subclasses: ["Circle of the Land", "Circle of the Moon", "Circle of the Sea", "Circle of the Stars"] },
    { name: "Fighter", subclasses: ["Battle Master", "Champion", "Eldritch Knight", "Psi Warrior"] },
    { name: "Monk", subclasses: ["Warrior of Mercy", "Warrior of Shadow", "Warrior of the Elements", "Warrior of the Open Hand"] },
    { name: "Paladin", subclasses: ["Oath of Devotion", "Oath of Glory", "Oath of the Ancients", "Oath of Vengeance"] },
    { name: "Ranger", subclasses: ["Beast Master", "Fey Wanderer", "Gloom Stalker", "Hunter"] },
    { name: "Rogue", subclasses: ["Arcane Trickster", "Assassin", "Soulknife", "Thief"] },
    { name: "Sorcerer", subclasses: ["Aberrant Sorcery", "Clockwork Sorcery", "Draconic Sorcery", "Wild Magic Sorcery"] },
    { name: "Warlock", subclasses: ["Archfey Patron", "Celestial Patron", "Fiend Patron", "Great Old One Patron"] },
    { name: "Wizard", subclasses: ["Abjurer", "Diviner", "Evoker", "Illusionist"] }
  ];

  D.classNames = function () {
    return D.CLASSES.map(function (c) { return c.name; });
  };

  function classNamed(name) {
    var wanted = String(name || "").trim().toLowerCase();
    for (var i = 0; i < D.CLASSES.length; i++) {
      if (D.CLASSES[i].name.toLowerCase() === wanted) return D.CLASSES[i];
    }
    return null;
  }

  // Subclasses to suggest for a class; every subclass in the book when the
  // class isn't one of them, so the list is never uselessly empty.
  D.subclassesFor = function (name) {
    var cls = classNamed(name);
    if (cls) return cls.subclasses;
    return D.CLASSES.reduce(function (all, c) { return all.concat(c.subclasses); }, []);
  };
})();
