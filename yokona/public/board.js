export const boardCategories = {
  "Random": [
    { slug: "gen", name: "General", description: "General Discussions" },
    { slug: "memes", name: "Memes", description: "Memes & Shitposting" },
    { slug: "pol", name: "Politics", description: "Politics (Proceed with Caution)" },
    { slug: "coal", name: "Coal", description: "Coal Posts" },
    { slug: "gem", name: "Gem", description: "Gem Posts" },
    { slug: "ph", name: "Philippines", description: "Philippines" },
    { slug: "green", name: "Green-Text", description: "Green-Text Stories" },
    { slug: "deb", name: "Debates", description: "Debates" },
    { slug: "hot", name: "Hot Takes", description: "Hot Takes" },
    { slug: "schizo", name: "Schizoposting", description: "Schizoposting" },
  ],
  "Communism": [
    { slug: "marx", name: "Marxism-Leninism", description: "Marxism-Leninism" },
    { slug: "np", name: "NPA/CPP", description: "NPA/CPP" },
  ],
  "Hobby": [
    { slug: "phys", name: "Physics", description: "Physics" },
    { slug: "math", name: "Math", description: "Math" },
    { slug: "it", name: "IT", description: "IT" },
  ],
  "Brain-rots": [
    { slug: "cap", name: "Capitalism", description: "Inhumanities of Capitalism" },
    { slug: "ana", name: "Anarchist", description: "Anarchist Brain-rot" },
    { slug: "lib", name: "Liberal", description: "Liberal Brain-rot" },
    { slug: "theism", name: "Theist", description: "Theist Brain-rot" },
    { slug: "west", name: "Western", description: "Western Brain-rot" },
    { slug: "maga", name: "MAGA", description: "MAGA Brain-rot" },
  ],
};

export const getCategoryIcon = (category: string): string => {
  const icons: Record<string, string> = {
    "Random": "🎲",
    "Communism": "☭",
    "Hobby": "🎯", 
    "Brain-rots": "🧠",
  };
  return icons[category] || "📂";
};