/**
 * The attribute tables: the facts about an invented person that code draws, so a model does not.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * The pilot cast six people by hand and let a model write them. The stereotypes came in with the FACTS: a bakery for the Lebanese-Canadian, a
 * seamstress mother, a dry-cleaning family, a food on every immigrant's list. A model that is asked to invent a Lebanese-Canadian's childhood
 * reaches for the same few things, and so does a person in a hurry. The fix is not to ask the model to try harder; it is to take those facts out of
 * its hands. Where someone was born, when, where they live now, whether and when they moved, what their parents did, what they did first, what
 * set them back and what they are irrationally fond of are drawn here, each from a list that does not depend on the others, so an origin cannot
 * predict a trade. The model writes the person AROUND the facts: the voice, the habits, the opinions, the way they tell it.
 *
 * Nothing here describes a culture. A list of countries and cities, a demonym for each, and the regions the diversity report counts over.
 */

const C = (region, demonym, languages, cities) => ({ region, demonym, languages, cities });

export const REGIONS = Object.freeze(['North America', 'Latin America & Caribbean', 'Europe', 'Middle East & North Africa', 'Sub-Saharan Africa', 'South Asia', 'East Asia', 'Southeast Asia', 'Central Asia & Caucasus', 'Oceania']);

/** Birth countries: where somebody can have been born. */
export const COUNTRIES = Object.freeze({
  // North America
  'Canada': C('North America', 'Canadian', ['English', 'French'], ['Halifax', 'Winnipeg', 'Montréal', 'Saskatoon', 'Whitehorse', 'Thunder Bay']),
  'United States': C('North America', 'American', ['English', 'Spanish'], ['Detroit', 'Houston', 'Anchorage', 'Albuquerque', 'Pittsburgh', 'Honolulu']),
  // Latin America & Caribbean
  'Mexico': C('Latin America & Caribbean', 'Mexican', ['Spanish'], ['Oaxaca', 'Monterrey', 'Mexico City', 'Mérida']),
  'Peru': C('Latin America & Caribbean', 'Peruvian', ['Spanish', 'Quechua'], ['Cusco', 'Arequipa', 'Lima', 'Iquitos']),
  'Colombia': C('Latin America & Caribbean', 'Colombian', ['Spanish'], ['Medellín', 'Cali', 'Bucaramanga']),
  'Chile': C('Latin America & Caribbean', 'Chilean', ['Spanish'], ['Valparaíso', 'Concepción', 'Punta Arenas']),
  'Argentina': C('Latin America & Caribbean', 'Argentine', ['Spanish'], ['Rosario', 'Córdoba', 'Mendoza']),
  'Brazil': C('Latin America & Caribbean', 'Brazilian', ['Portuguese'], ['Recife', 'Curitiba', 'Belém', 'Porto Alegre']),
  'Cuba': C('Latin America & Caribbean', 'Cuban', ['Spanish'], ['Santiago de Cuba', 'Camagüey', 'Matanzas']),
  'Jamaica': C('Latin America & Caribbean', 'Jamaican', ['English'], ['Kingston', 'Montego Bay', 'Mandeville']),
  'Trinidad and Tobago': C('Latin America & Caribbean', 'Trinidadian', ['English'], ['San Fernando', 'Port of Spain', 'Scarborough']),
  'Bolivia': C('Latin America & Caribbean', 'Bolivian', ['Spanish', 'Aymara'], ['Sucre', 'Cochabamba', 'Oruro']),
  'Guatemala': C('Latin America & Caribbean', 'Guatemalan', ['Spanish'], ['Quetzaltenango', 'Antigua Guatemala']),
  // Europe
  'Poland': C('Europe', 'Polish', ['Polish'], ['Gdańsk', 'Łódź', 'Wrocław', 'Białystok']),
  'Portugal': C('Europe', 'Portuguese', ['Portuguese'], ['Porto', 'Faro', 'Coimbra']),
  'Ireland': C('Europe', 'Irish', ['English', 'Irish'], ['Cork', 'Galway', 'Limerick']),
  'United Kingdom': C('Europe', 'British', ['English', 'Welsh'], ['Glasgow', 'Leeds', 'Cardiff', 'Belfast']),
  'Iceland': C('Europe', 'Icelandic', ['Icelandic'], ['Akureyri', 'Reykjavík']),
  'Estonia': C('Europe', 'Estonian', ['Estonian', 'Russian'], ['Tartu', 'Narva', 'Pärnu']),
  'Croatia': C('Europe', 'Croatian', ['Croatian'], ['Split', 'Rijeka', 'Osijek']),
  'Bosnia and Herzegovina': C('Europe', 'Bosnian', ['Bosnian'], ['Sarajevo', 'Tuzla', 'Mostar']),
  'Greece': C('Europe', 'Greek', ['Greek'], ['Thessaloniki', 'Patras', 'Heraklion']),
  'Italy': C('Europe', 'Italian', ['Italian'], ['Naples', 'Bologna', 'Trieste', 'Cagliari']),
  'France': C('Europe', 'French', ['French'], ['Lyon', 'Marseille', 'Lille', 'Strasbourg']),
  'Germany': C('Europe', 'German', ['German'], ['Leipzig', 'Bremen', 'Dortmund']),
  'Norway': C('Europe', 'Norwegian', ['Norwegian'], ['Trondheim', 'Tromsø', 'Stavanger']),
  'Finland': C('Europe', 'Finnish', ['Finnish', 'Swedish'], ['Oulu', 'Tampere', 'Turku']),
  'Ukraine': C('Europe', 'Ukrainian', ['Ukrainian', 'Russian'], ['Lviv', 'Odesa', 'Kharkiv']),
  'Romania': C('Europe', 'Romanian', ['Romanian'], ['Cluj-Napoca', 'Iași', 'Timișoara']),
  'Serbia': C('Europe', 'Serbian', ['Serbian'], ['Novi Sad', 'Niš']),
  'Netherlands': C('Europe', 'Dutch', ['Dutch'], ['Rotterdam', 'Groningen', 'Eindhoven']),
  'Spain': C('Europe', 'Spanish', ['Spanish', 'Catalan', 'Basque'], ['Seville', 'Bilbao', 'Valencia']),
  'Czechia': C('Europe', 'Czech', ['Czech'], ['Brno', 'Ostrava', 'Plzeň']),
  'Hungary': C('Europe', 'Hungarian', ['Hungarian'], ['Szeged', 'Debrecen', 'Pécs']),
  // Middle East & North Africa
  'Lebanon': C('Middle East & North Africa', 'Lebanese', ['Arabic', 'French'], ['Tripoli', 'Sidon', 'Zahlé']),
  'Egypt': C('Middle East & North Africa', 'Egyptian', ['Arabic'], ['Alexandria', 'Aswan', 'Asyut']),
  'Morocco': C('Middle East & North Africa', 'Moroccan', ['Arabic', 'Amazigh', 'French'], ['Fès', 'Casablanca', 'Oujda']),
  'Tunisia': C('Middle East & North Africa', 'Tunisian', ['Arabic', 'French'], ['Sfax', 'Sousse', 'Bizerte']),
  'Iran': C('Middle East & North Africa', 'Iranian', ['Persian', 'Azerbaijani'], ['Tabriz', 'Shiraz', 'Isfahan']),
  'Iraq': C('Middle East & North Africa', 'Iraqi', ['Arabic', 'Kurdish'], ['Basra', 'Mosul', 'Erbil']),
  'Jordan': C('Middle East & North Africa', 'Jordanian', ['Arabic'], ['Irbid', 'Zarqa', 'Aqaba']),
  'Türkiye': C('Middle East & North Africa', 'Turkish', ['Turkish', 'Kurdish'], ['İzmir', 'Konya', 'Trabzon', 'Gaziantep']),
  'Algeria': C('Middle East & North Africa', 'Algerian', ['Arabic', 'Amazigh', 'French'], ['Oran', 'Constantine', 'Annaba']),
  // Sub-Saharan Africa
  'Nigeria': C('Sub-Saharan Africa', 'Nigerian', ['English', 'Yoruba', 'Igbo', 'Hausa'], ['Ibadan', 'Enugu', 'Kano', 'Port Harcourt']),
  'Ghana': C('Sub-Saharan Africa', 'Ghanaian', ['English', 'Twi', 'Ewe'], ['Kumasi', 'Tamale', 'Cape Coast']),
  'Kenya': C('Sub-Saharan Africa', 'Kenyan', ['Swahili', 'English'], ['Kisumu', 'Mombasa', 'Eldoret']),
  'Ethiopia': C('Sub-Saharan Africa', 'Ethiopian', ['Amharic', 'Oromo'], ['Hawassa', 'Bahir Dar', 'Dire Dawa']),
  'South Africa': C('Sub-Saharan Africa', 'South African', ['English', 'Zulu', 'Afrikaans', 'Xhosa'], ['Gqeberha', 'Durban', 'Bloemfontein', 'Polokwane']),
  'Senegal': C('Sub-Saharan Africa', 'Senegalese', ['French', 'Wolof'], ['Saint-Louis', 'Thiès', 'Ziguinchor']),
  'Uganda': C('Sub-Saharan Africa', 'Ugandan', ['English', 'Luganda'], ['Gulu', 'Mbarara', 'Jinja']),
  'Tanzania': C('Sub-Saharan Africa', 'Tanzanian', ['Swahili', 'English'], ['Arusha', 'Mwanza', 'Dodoma']),
  'Zimbabwe': C('Sub-Saharan Africa', 'Zimbabwean', ['English', 'Shona', 'Ndebele'], ['Bulawayo', 'Mutare']),
  'Cameroon': C('Sub-Saharan Africa', 'Cameroonian', ['French', 'English'], ['Douala', 'Bamenda', 'Garoua']),
  'Rwanda': C('Sub-Saharan Africa', 'Rwandan', ['Kinyarwanda', 'French', 'English'], ['Huye', 'Musanze']),
  'Madagascar': C('Sub-Saharan Africa', 'Malagasy', ['Malagasy', 'French'], ['Antsirabe', 'Toamasina']),
  // South Asia
  'India': C('South Asia', 'Indian', ['Hindi', 'Tamil', 'Bengali', 'Malayalam', 'Marathi', 'English'], ['Chennai', 'Pune', 'Kolkata', 'Guwahati', 'Jaipur', 'Kochi']),
  'Pakistan': C('South Asia', 'Pakistani', ['Urdu', 'Punjabi', 'Sindhi'], ['Karachi', 'Lahore', 'Peshawar', 'Quetta']),
  'Bangladesh': C('South Asia', 'Bangladeshi', ['Bengali'], ['Chittagong', 'Sylhet', 'Khulna']),
  'Sri Lanka': C('South Asia', 'Sri Lankan', ['Sinhala', 'Tamil'], ['Kandy', 'Jaffna', 'Galle']),
  'Nepal': C('South Asia', 'Nepali', ['Nepali'], ['Pokhara', 'Kathmandu', 'Biratnagar']),
  // East Asia
  'Japan': C('East Asia', 'Japanese', ['Japanese'], ['Osaka', 'Sendai', 'Fukuoka', 'Kanazawa']),
  'South Korea': C('East Asia', 'Korean', ['Korean'], ['Busan', 'Daegu', 'Gwangju']),
  'China': C('East Asia', 'Chinese', ['Mandarin', 'Cantonese'], ['Chengdu', 'Harbin', 'Xiamen', 'Wuhan', 'Kunming']),
  'Taiwan': C('East Asia', 'Taiwanese', ['Mandarin', 'Taiwanese'], ['Tainan', 'Taichung', 'Hualien']),
  'Mongolia': C('East Asia', 'Mongolian', ['Mongolian'], ['Ulaanbaatar', 'Darkhan', 'Erdenet']),
  // Southeast Asia
  'Philippines': C('Southeast Asia', 'Filipino', ['Filipino', 'Cebuano', 'English'], ['Cebu City', 'Davao', 'Baguio']),
  'Indonesia': C('Southeast Asia', 'Indonesian', ['Indonesian', 'Javanese'], ['Surabaya', 'Medan', 'Yogyakarta', 'Makassar']),
  'Vietnam': C('Southeast Asia', 'Vietnamese', ['Vietnamese'], ['Da Nang', 'Huế', 'Cần Thơ']),
  'Thailand': C('Southeast Asia', 'Thai', ['Thai'], ['Chiang Mai', 'Khon Kaen', 'Songkhla']),
  'Malaysia': C('Southeast Asia', 'Malaysian', ['Malay', 'English', 'Mandarin', 'Tamil'], ['Penang', 'Kuching', 'Ipoh']),
  'Cambodia': C('Southeast Asia', 'Cambodian', ['Khmer'], ['Battambang', 'Siem Reap']),
  // Central Asia & Caucasus
  'Kazakhstan': C('Central Asia & Caucasus', 'Kazakh', ['Kazakh', 'Russian'], ['Almaty', 'Karaganda', 'Shymkent']),
  'Uzbekistan': C('Central Asia & Caucasus', 'Uzbek', ['Uzbek', 'Russian'], ['Samarkand', 'Bukhara', 'Namangan']),
  'Georgia': C('Central Asia & Caucasus', 'Georgian', ['Georgian'], ['Tbilisi', 'Batumi', 'Kutaisi']),
  'Armenia': C('Central Asia & Caucasus', 'Armenian', ['Armenian'], ['Gyumri', 'Vanadzor']),
  'Azerbaijan': C('Central Asia & Caucasus', 'Azerbaijani', ['Azerbaijani'], ['Ganja', 'Sumqayit']),
  'Kyrgyzstan': C('Central Asia & Caucasus', 'Kyrgyz', ['Kyrgyz', 'Russian'], ['Osh', 'Karakol']),
  // Oceania
  'Australia': C('Oceania', 'Australian', ['English'], ['Hobart', 'Perth', 'Darwin', 'Adelaide', 'Townsville']),
  'New Zealand': C('Oceania', 'New Zealander', ['English', 'Māori'], ['Auckland', 'Dunedin', 'Christchurch', 'Whangārei']),
  'Fiji': C('Oceania', 'Fijian', ['English', 'Fijian', 'Hindi'], ['Suva', 'Lautoka', 'Labasa']),
  'Samoa': C('Oceania', 'Samoan', ['Samoan', 'English'], ['Apia', 'Salelologa']),
  'Tonga': C('Oceania', 'Tongan', ['Tongan', 'English'], ['Nukuʻalofa', 'Neiafu']),
  'Papua New Guinea': C('Oceania', 'Papua New Guinean', ['Tok Pisin', 'English'], ['Lae', 'Madang', 'Goroka']),
});

/** Where somebody can have moved to: cities that draw people from elsewhere, and the adjective for living there. */
export const HUBS = Object.freeze([
  { city: 'Toronto', country: 'Canada', adjective: 'Canadian' }, { city: 'Vancouver', country: 'Canada', adjective: 'Canadian' }, { city: 'Montréal', country: 'Canada', adjective: 'Canadian' },
  { city: 'Chicago', country: 'United States', adjective: 'American' }, { city: 'Houston', country: 'United States', adjective: 'American' }, { city: 'Oakland', country: 'United States', adjective: 'American' },
  { city: 'London', country: 'United Kingdom', adjective: 'British' }, { city: 'Manchester', country: 'United Kingdom', adjective: 'British' }, { city: 'Dublin', country: 'Ireland', adjective: 'Irish' },
  { city: 'Berlin', country: 'Germany', adjective: 'German' }, { city: 'Malmö', country: 'Sweden', adjective: 'Swedish' }, { city: 'Amsterdam', country: 'Netherlands', adjective: 'Dutch' },
  { city: 'Lisbon', country: 'Portugal', adjective: 'Portuguese' }, { city: 'Lyon', country: 'France', adjective: 'French' }, { city: 'Milan', country: 'Italy', adjective: 'Italian' },
  { city: 'Dubai', country: 'United Arab Emirates', adjective: 'Emirati' }, { city: 'Doha', country: 'Qatar', adjective: 'Qatari' }, { city: 'Istanbul', country: 'Türkiye', adjective: 'Turkish' },
  { city: 'Johannesburg', country: 'South Africa', adjective: 'South African' }, { city: 'Nairobi', country: 'Kenya', adjective: 'Kenyan' }, { city: 'Lagos', country: 'Nigeria', adjective: 'Nigerian' },
  { city: 'Singapore', country: 'Singapore', adjective: 'Singaporean' }, { city: 'Kuala Lumpur', country: 'Malaysia', adjective: 'Malaysian' }, { city: 'Tokyo', country: 'Japan', adjective: 'Japanese' },
  { city: 'Seoul', country: 'South Korea', adjective: 'Korean' }, { city: 'Hong Kong', country: 'Hong Kong', adjective: 'Hong Kong' },
  { city: 'Sydney', country: 'Australia', adjective: 'Australian' }, { city: 'Melbourne', country: 'Australia', adjective: 'Australian' }, { city: 'Auckland', country: 'New Zealand', adjective: 'New Zealand' },
  { city: 'São Paulo', country: 'Brazil', adjective: 'Brazilian' }, { city: 'Mexico City', country: 'Mexico', adjective: 'Mexican' }, { city: 'Buenos Aires', country: 'Argentina', adjective: 'Argentine' },
]);

/**
 * Work that has been the shorthand for where someone comes from, which a model reaches for without being asked. These are not forbidden; they are
 * not DRAWN for a person from the region listed, and a sheet that gives a person of that region a family in one is flagged unless the draw gave
 * it (check.js). The aim is that an origin cannot predict a trade, the way it does in a lazy character sheet.
 */
export const WATCHED_TRADES = Object.freeze({
  'East Asia': ['dry clean', 'laundr', 'restaurant', 'takeaway', 'convenience', 'nail salon', 'tutor'],
  'South Asia': ['convenience', 'corner shop', 'taxi', 'motel', 'call cent', 'newsagent'],
  'Middle East & North Africa': ['bak', 'restaurant', 'corner shop', 'taxi', 'carpet', 'spice'],
  'Latin America & Caribbean': ['cleaner', 'gardener', 'domestic', 'labourer'],
  'Sub-Saharan Africa': ['taxi', 'security guard', 'market', 'night clean'],
  'Southeast Asia': ['nail salon', 'restaurant', 'takeaway', 'market', 'seamstress', 'garment', 'tailor'],
  'Europe': ['plumber', 'au pair', 'labourer'],
  'Central Asia & Caucasus': ['market', 'taxi'],
  'Oceania': ['security guard', 'meatworks', 'cleaner'],
  'North America': [],
});

/**
 * Trades the pilot's writer reached for in any region (three of six people had a garment trade somewhere in the family). A sheet that gives someone
 * a family in one of these is flagged wherever they are from, unless the draw gave it. Stems, matched anywhere in the word.
 */
export const GLOBALLY_WATCHED = Object.freeze(['tailor', 'seamstress', 'garment', 'dry clean', 'laundr', 'bakery', 'takeaway', 'corner shop', 'convenience store', 'nail salon', 'taxi', 'motel', 'restaurant']);

/** What a parent might have done for a living. [description, first year it existed as a job, last year it was common]. Broad on purpose, and uncorrelated with origin. */
export const PARENT_WORK = Object.freeze([
  ['a civil servant in a records office', 1900, 2100], ['a bus driver', 1900, 2100], ['a primary-school teacher', 1900, 2100], ['a nurse', 1900, 2100],
  ['an electrician', 1900, 2100], ['a smallholder who also drove a delivery van', 1900, 2100], ['a postal worker', 1900, 2100], ['a bookkeeper', 1900, 2100],
  ['a factory-floor supervisor', 1900, 2100], ['a telephone exchange operator', 1900, 1988], ['a radio and television repairer', 1930, 1998], ['a land surveyor', 1900, 2100],
  ['a librarian', 1900, 2100], ['a pharmacist', 1900, 2100], ['a joiner', 1900, 2100], ['a mechanic at a bus depot', 1900, 2100], ['a welder at a shipyard', 1900, 2100],
  ['a hospital porter', 1900, 2100], ['a court clerk', 1900, 2100], ['a lighthouse and harbour engineer', 1900, 2100], ['a bank teller', 1900, 2100], ['a school caretaker', 1900, 2100],
  ['a typesetter at a newspaper', 1900, 1995], ['a rail signaller', 1900, 2100], ['a district nurse', 1900, 2100], ['a university lab technician', 1930, 2100],
  ['a weather-station observer', 1900, 2100], ['a shop-floor foreman at a plant that made machine parts', 1900, 2100], ['a social worker', 1950, 2100], ['a cinema projectionist', 1900, 2000],
  ['a ferry deckhand', 1900, 2100], ['a dental assistant', 1930, 2100], ['a geography teacher', 1900, 2100], ['a town planner', 1950, 2100], ['a sound engineer at a local radio station', 1950, 2100],
  ['a forestry worker', 1900, 2100], ['a mine electrician', 1900, 2100], ['a lorry driver on long hauls', 1930, 2100], ['a midwife', 1900, 2100], ['an agricultural extension officer', 1950, 2100],
  ['a hospital administrator', 1950, 2100], ['a church organist who also taught piano', 1900, 2100], ['a tram driver', 1900, 2100], ['a machine-tool operator', 1900, 2100],
  ['a customs officer', 1900, 2100], ['a fire-station dispatcher', 1950, 2100], ['a water-board engineer', 1900, 2100], ['a nursery-school teacher', 1900, 2100], ['a sign painter', 1900, 2100],
  ['a hotel night clerk', 1900, 2100], ['a physiotherapist', 1950, 2100], ['a school secretary', 1900, 2100], ['a cabinetmaker', 1900, 2100],
  ['a locksmith', 1900, 2100], ['a ward clerk', 1950, 2100], ['a power-station operator', 1930, 2100], ['a software tester', 1985, 2100], ['a call-centre team leader', 1990, 2100],
]);

/** Something from childhood the writer is handed, so it does not reach for a cultural one. */
export const CHILDHOOD_THINGS = Object.freeze([
  'a shortwave radio that belonged to a neighbour', 'a library card used until it fell apart', 'a bicycle repair shop two doors down', 'swimming lessons in a cold pool',
  'a piano nobody could tune', 'a vegetable plot behind the flats', 'a cousin\'s stack of comics', 'a chess club that met in a school cloakroom', 'a school choir with one very loud tenor',
  'a cassette recorder and a lot of blank tapes', 'a stamp album from an uncle', 'a school theatre group that never finished a play', 'a chemistry set with half the bottles missing',
  'a rowing boat borrowed every summer', 'a football kept in the stairwell', 'a telescope made from a kit', 'a shelf of encyclopaedias bought in instalments', 'a paper round before school',
  'a pet tortoise that outlived two flats', 'a dog that walked itself to the corner', 'a bus route learned by heart', 'a market where they were sent on errands', 'a sewing machine used only for hems',
  'a lending library on wheels', 'a cinema that showed one film a week', 'a flooded cellar and a lot of wellington boots', 'a long illness that kept them home for a term', 'a grandparent who wrote letters every Sunday',
  'a neighbour\'s workshop with the door always open', 'a school trip to the sea that nearly did not happen',
]);

/** What went wrong once. */
export const SETBACKS = Object.freeze([
  'a project cancelled two weeks before it launched', 'a layoff in a bad year for the industry', 'a manager who took the credit and kept the budget', 'a year of burnout that ended a promising run',
  'a small business that did not survive its second winter', 'a move to a new country that put a career back to the beginning', 'a parent\'s long illness that changed their hours for years',
  'a bad year of freelancing with one client who did not pay', 'a partnership that ended badly', 'a file lost the week before a deadline, and the lesson that followed',
  'a degree abandoned halfway and picked up again later', 'a visa problem that cost a year', 'a team that fell apart when its founder left', 'a product that worked and that nobody wanted',
]);

/** What they are irrationally fond of (a single hook for the off-the-clock section). Wide on purpose; one per person in a team. */
export const FONDNESSES = Object.freeze([
  'old maps of cities they have never visited', 'a collection of bus and ferry tickets', 'competitive crosswords', 'swimming in the sea in all weather', 'growing chillies on a balcony',
  'repairing old radios', 'learning a language they will never use', 'building small wooden boats', 'a brass band they play in badly', 'keeping weather records for their street',
  'recognising bird song', 'amateur astronomy from a car park', 'baking one kind of bread over and over', 'knitting patterns from the 1970s', 'long-distance walking on bad maps',
  'tabletop wargaming with painted figures', 'pigeon racing, inherited', 'a climbing gym three evenings a week', 'puzzle boxes', 'folding paper', 'restoring bicycles that nobody asked for',
  'writing letters to pen-pals', 'tide tables', 'fountain pens and the ink that goes with them', 'cataloguing their own books twice', 'pickling whatever is in season', 'ukulele chords',
  'watching trains from a footbridge', 'collecting maps of underground systems', 'sketching strangers on trams', 'rewatching one long film series each winter', 'fixing other people\'s shelves',
  'a very old cat', 'night buses', 'second-hand dictionaries', 'tiny gardens', 'lighthouses', 'public libraries in other cities',
]);

/** How they come across (short; written to be dropped into a sentence). Drawn without replacement within a team. */
export const TEMPERAMENTS = Object.freeze([
  'calm, dry, immovable about time', 'warm, quick, over-enthusiastic', 'quiet, exact, dry', 'careful, patient, uncompromising about sources', 'sharp, dry, relentless, fair',
  'gentle, careful, a little shy', 'restless, funny, impatient with ceremony', 'steady, generous with credit, hates being rushed', 'intense, warm, private', 'easygoing, observant, slow to commit',
  'formal, kind, exacting about manners', 'bold, curious, argues for fun', 'reserved, loyal, dryly funny', 'playful, scattered, brilliant in bursts', 'serious, fair, quick to forgive',
  'wry, sceptical, secretly sentimental', 'earnest, anxious, thorough', 'confident, blunt, kind underneath', 'dreamy, precise, stubborn about taste', 'brisk, organised, impatient with waffle',
  'soft-spoken, stubborn, unembarrassed', 'mischievous, generous, bad with deadlines', 'patient, literal-minded, delighted by small mechanisms', 'theatrical, kind, tired by evening',
  'upright, wry, allergic to fashion', 'cheerful, forgetful, very good in a crisis', 'guarded, funny, loyal for life', 'thoughtful, slow to speak, hard to move', 'sociable, competitive, a bad loser',
  'tender, exacting, unimpressed by cleverness', 'practical, impatient, secretly romantic', 'curious, tactless, honestly sorry afterwards',
]);

/** How they work with other people. Drawn without replacement within a team. */
export const WORKING_STYLES = Object.freeze([
  'planner, talks things through, decides out loud', 'improviser, brainstorms aloud, drafts fast and cuts later', 'visual first; works alone, then shows', 'slow and thorough; wants the source; takes notes by hand',
  'reads everything twice; objects early; asks what would change their mind', 'listens for a long time, then writes the file; verifies before posting', 'builds the smallest thing that could be wrong and shows it',
  'works from checklists and updates them', 'sketches while others talk', 'needs the whole picture before starting', 'starts with the hardest part', 'starts with the ending and works backwards',
  'pairs with one person at a time', 'keeps a running list and reads it out when the room stalls', 'asks the question nobody asked', 'summarises every ten minutes, whether or not anyone wanted it',
]);

/** Where somebody starts when nothing is said: drawn pools for birth years. */
export const BIRTH_YEARS = Object.freeze({ min: 1958, max: 2002 });

export const PRONOUNS = Object.freeze(['she', 'he', 'they']);
