export const SERVICE_KEYWORDS: Record<string, string[]> = {
  cleaning: [
    "house cleaning", "maid service", "deep clean", "cleaning service", "cleaner",
    "clean my home", "clean my house", "housekeeping", "janitorial", "move out clean",
    "move in clean", "carpet clean", "window cleaning", "pressure wash",
    // shorter/broader matches
    "cleaning", "maid", "housekeeper", "sweep", "mop", "scrub",
  ],
  landscaping: [
    "lawn mowing", "lawn care", "landscaping", "yard work", "grass cutting",
    "tree trimming", "tree removal", "mulching", "shrub trimming", "hedge trimming",
    "snow removal", "leaf removal", "gutter cleaning", "irrigation",
    // shorter/broader
    "lawn", "yard", "grass", "mow", "trim", "landscape", "bushes", "garden",
    "sod", "sprinkler", "fertilize",
  ],
  plumbing: [
    "plumber", "plumbing", "leaky faucet", "clogged drain", "toilet repair",
    "water heater", "pipe leak", "burst pipe", "drain cleaning", "sewer",
    "water damage", "faucet repair", "garbage disposal",
    // shorter/broader
    "leak", "pipe", "drain", "toilet", "faucet", "water heater", "clog",
    "sewage", "water line",
  ],
  hvac: [
    "hvac", "air conditioning", "ac repair", "furnace", "heating repair",
    "ductwork", "heat pump", "thermostat", "air filter", "ac unit",
    "central air", "boiler", "ventilation", "ac went out", "ac not working",
    // shorter/broader
    "ac", "a/c", "air conditioner", "heat pump", "cooling", "heating",
    "air handler", "duct", "vents",
  ],
  handyman: [
    "handyman", "repairs", "drywall", "painting", "door repair",
    "window repair", "tile", "flooring", "deck repair",
    "fence repair", "general repairs", "home repair",
    // shorter/broader
    "fix", "repair", "install", "patch", "caulk", "grout", "paint",
    "hang", "assemble", "carpenter", "woodwork",
  ],
  remodeling: [
    "remodel", "renovation", "bathroom remodel", "kitchen remodel", "addition",
    "basement finishing", "room addition", "floor replacement", "roofing",
    "siding", "contractor",
    // shorter/broader
    "renovate", "rebuild", "gut", "demo", "construction", "build", "addition",
    "roof", "flooring install", "tile install",
  ],
  electrical: [
    "electrician", "electrical", "wiring", "outlet", "breaker", "panel",
    "light fixture", "ceiling fan", "generator", "power outage",
    "electrical repair", "rewire",
  ],
  moving: [
    "mover", "moving company", "moving help", "move furniture",
    "help moving", "move boxes", "packing help",
  ],
};

export function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(SERVICE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return "other";
}

export function detectPriority(text: string): "high" | "medium" | "low" {
  const urgent = ["urgent", "asap", "emergency", "immediately", "today", "right away", "need now", "tonight", "broken", "burst", "flood", "fire", "no heat", "no ac", "no power"];
  const low = ["someday", "not urgent", "when available", "no rush", "eventually"];
  const lower = text.toLowerCase();
  if (urgent.some(w => lower.includes(w))) return "high";
  if (low.some(w => lower.includes(w))) return "low";
  return "medium";
}
