// Country → State/Province → Cities (sports-relevant nations)
export const COUNTRIES_STATES_CITIES: Record<string, Record<string, string[]>> = {
  India: {
    'Andhra Pradesh':     ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Kakinada'],
    'Bihar':              ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga'],
    'Delhi':              ['New Delhi', 'Dwarka', 'Rohini', 'Shahdara', 'Noida Extension'],
    'Gujarat':            ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Gandhinagar'],
    'Haryana':            ['Gurugram', 'Faridabad', 'Hisar', 'Rohtak', 'Panipat', 'Ambala'],
    'Karnataka':          ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru', 'Belagavi', 'Davangere'],
    'Kerala':             ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam'],
    'Madhya Pradesh':     ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain'],
    'Maharashtra':        ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Solapur'],
    'Odisha':             ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Brahmapur', 'Sambalpur'],
    'Punjab':             ['Ludhiana', 'Amritsar', 'Jalandhar', 'Chandigarh', 'Patiala'],
    'Rajasthan':          ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner'],
    'Tamil Nadu':         ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli', 'Tirunelveli'],
    'Telangana':          ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam'],
    'Uttar Pradesh':      ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Allahabad', 'Meerut'],
    'West Bengal':        ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri'],
  },

  'United States': {
    'Arizona':            ['Phoenix', 'Tucson', 'Scottsdale', 'Mesa', 'Tempe', 'Chandler'],
    'California':         ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno', 'Oakland'],
    'Colorado':           ['Denver', 'Colorado Springs', 'Aurora', 'Boulder', 'Fort Collins'],
    'Florida':            ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale', 'St. Petersburg'],
    'Georgia':            ['Atlanta', 'Augusta', 'Savannah', 'Columbus', 'Macon'],
    'Illinois':           ['Chicago', 'Aurora', 'Rockford', 'Naperville', 'Peoria'],
    'Indiana':            ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel'],
    'Massachusetts':      ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell'],
    'Michigan':           ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Lansing'],
    'Nevada':             ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks'],
    'New York':           ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse', 'Yonkers'],
    'North Carolina':     ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'],
    'Ohio':               ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
    'Pennsylvania':       ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'],
    'Tennessee':          ['Memphis', 'Nashville', 'Knoxville', 'Chattanooga', 'Clarksville'],
    'Texas':              ['Houston', 'Dallas', 'San Antonio', 'Austin', 'Fort Worth', 'El Paso'],
    'Washington':         ['Seattle', 'Spokane', 'Tacoma', 'Bellevue', 'Kirkland'],
  },

  'United Kingdom': {
    'England':            ['London', 'Birmingham', 'Manchester', 'Leeds', 'Liverpool', 'Sheffield', 'Bristol', 'Newcastle', 'Nottingham', 'Leicester', 'Southampton', 'Oxford', 'Cambridge'],
    'Scotland':           ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee', 'Inverness'],
    'Wales':              ['Cardiff', 'Swansea', 'Newport', 'Wrexham', 'Barry'],
    'Northern Ireland':   ['Belfast', 'Derry', 'Lisburn', 'Newry', 'Armagh'],
  },

  'Australia': {
    'Australian Capital Territory': ['Canberra'],
    'New South Wales':    ['Sydney', 'Newcastle', 'Wollongong', 'Parramatta', 'Central Coast'],
    'Northern Territory': ['Darwin', 'Alice Springs', 'Palmerston'],
    'Queensland':         ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns'],
    'South Australia':    ['Adelaide', 'Mount Gambier', 'Whyalla', 'Murray Bridge'],
    'Tasmania':           ['Hobart', 'Launceston', 'Devonport', 'Burnie'],
    'Victoria':           ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton'],
    'Western Australia':  ['Perth', 'Fremantle', 'Bunbury', 'Geraldton', 'Kalgoorlie'],
  },

  'Pakistan': {
    'Balochistan':               ['Quetta', 'Gwadar', 'Turbat', 'Khuzdar'],
    'Islamabad Capital Territory': ['Islamabad'],
    'Khyber Pakhtunkhwa':        ['Peshawar', 'Mardan', 'Abbottabad', 'Swat', 'Kohat'],
    'Punjab':                    ['Lahore', 'Faisalabad', 'Rawalpindi', 'Gujranwala', 'Multan', 'Sialkot', 'Bahawalpur'],
    'Sindh':                     ['Karachi', 'Hyderabad', 'Sukkur', 'Larkana', 'Mirpurkhas'],
  },

  'South Africa': {
    'Eastern Cape':       ['Port Elizabeth', 'East London', 'Mthatha', 'Uitenhage'],
    'Free State':         ['Bloemfontein', 'Welkom', 'Kroonstad'],
    'Gauteng':            ['Johannesburg', 'Pretoria', 'Soweto', 'Sandton', 'Ekurhuleni'],
    'KwaZulu-Natal':      ['Durban', 'Pietermaritzburg', 'Richards Bay', 'Newcastle'],
    'Limpopo':            ['Polokwane', 'Tzaneen', 'Mokopane'],
    'Mpumalanga':         ['Nelspruit', 'Witbank', 'Middelburg'],
    'Western Cape':       ['Cape Town', 'Stellenbosch', 'George', 'Paarl', 'Worcester'],
  },

  'New Zealand': {
    'Auckland':           ['Auckland', 'North Shore', 'Waitakere', 'Manukau', 'Papakura'],
    'Bay of Plenty':      ['Tauranga', 'Rotorua', 'Whakatane'],
    'Canterbury':         ['Christchurch', 'Timaru', 'Ashburton', 'Rangiora'],
    'Manawatu-Wanganui':  ['Palmerston North', 'Whanganui'],
    'Otago':              ['Dunedin', 'Queenstown', 'Oamaru'],
    'Waikato':            ['Hamilton', 'Thames', 'Te Awamutu', 'Cambridge'],
    'Wellington':         ['Wellington', 'Hutt City', 'Porirua', 'Upper Hutt'],
  },

  'Sri Lanka': {
    'Central Province':   ['Kandy', 'Matale', 'Nuwara Eliya'],
    'Eastern Province':   ['Trincomalee', 'Batticaloa', 'Ampara'],
    'Northern Province':  ['Jaffna', 'Kilinochchi', 'Mannar'],
    'Southern Province':  ['Galle', 'Matara', 'Hambantota'],
    'Western Province':   ['Colombo', 'Negombo', 'Kalutara', 'Sri Jayawardenepura'],
  },

  'Bangladesh': {
    'Chittagong Division': ['Chittagong', 'Cox\'s Bazar', 'Comilla', 'Feni'],
    'Dhaka Division':      ['Dhaka', 'Narayanganj', 'Gazipur', 'Narsingdi'],
    'Khulna Division':     ['Khulna', 'Jessore', 'Barisal', 'Satkhira'],
    'Rajshahi Division':   ['Rajshahi', 'Bogra', 'Pabna', 'Sirajganj'],
    'Rangpur Division':    ['Rangpur', 'Dinajpur', 'Thakurgaon'],
    'Sylhet Division':     ['Sylhet', 'Moulvibazar', 'Habiganj'],
  },

  'Canada': {
    'Alberta':            ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'Medicine Hat'],
    'British Columbia':   ['Vancouver', 'Victoria', 'Surrey', 'Burnaby', 'Kelowna', 'Abbotsford'],
    'Manitoba':           ['Winnipeg', 'Brandon', 'Steinbach'],
    'New Brunswick':      ['Moncton', 'Fredericton', 'Saint John'],
    'Nova Scotia':        ['Halifax', 'Sydney', 'Truro', 'Dartmouth'],
    'Ontario':            ['Toronto', 'Ottawa', 'Hamilton', 'Mississauga', 'London', 'Kitchener', 'Windsor'],
    'Quebec':             ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Sherbrooke'],
    'Saskatchewan':       ['Saskatoon', 'Regina', 'Prince Albert'],
  },

  'UAE': {
    'Abu Dhabi':          ['Abu Dhabi', 'Al Ain', 'Ruwais', 'Madinat Zayed'],
    'Ajman':              ['Ajman'],
    'Dubai':              ['Dubai', 'Jebel Ali', 'Deira'],
    'Fujairah':           ['Fujairah', 'Dibba Al Fujairah'],
    'Ras Al Khaimah':     ['Ras Al Khaimah', 'Al Jazirah Al Hamra'],
    'Sharjah':            ['Sharjah', 'Khor Fakkan', 'Kalba'],
    'Umm Al Quwain':      ['Umm Al Quwain'],
  },

  'Nigeria': {
    'Abuja FCT':          ['Abuja', 'Gwagwalada', 'Kuje'],
    'Anambra':            ['Awka', 'Onitsha', 'Nnewi'],
    'Edo':                ['Benin City', 'Auchi', 'Ekpoma'],
    'Enugu':              ['Enugu', 'Nsukka', 'Awgu'],
    'Kano':               ['Kano', 'Wudil', 'Gaya'],
    'Lagos':              ['Lagos', 'Ikeja', 'Badagry', 'Epe', 'Ikorodu'],
    'Oyo':                ['Ibadan', 'Ogbomosho', 'Oyo', 'Iseyin'],
    'Rivers':             ['Port Harcourt', 'Obio-Akpor', 'Bonny'],
  },

  'Kenya': {
    'Kiambu County':      ['Thika', 'Kiambu', 'Limuru'],
    'Kisumu County':      ['Kisumu', 'Ahero', 'Muhoroni'],
    'Mombasa County':     ['Mombasa', 'Likoni', 'Changamwe'],
    'Nairobi County':     ['Nairobi', 'Westlands', 'Karen', 'Embakasi'],
    'Nakuru County':      ['Nakuru', 'Naivasha', 'Gilgil'],
    'Uasin Gishu County': ['Eldoret', 'Turbo', 'Moiben'],
  },

  'Brazil': {
    'Amazonas':           ['Manaus', 'Parintins', 'Itacoatiara'],
    'Bahia':              ['Salvador', 'Feira de Santana', 'Vitória da Conquista'],
    'Ceará':              ['Fortaleza', 'Caucaia', 'Juazeiro do Norte'],
    'Goiás':              ['Goiânia', 'Aparecida de Goiânia', 'Anápolis'],
    'Minas Gerais':       ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora'],
    'Pará':               ['Belém', 'Ananindeua', 'Santarém'],
    'Pernambuco':         ['Recife', 'Caruaru', 'Petrolina'],
    'Rio de Janeiro':     ['Rio de Janeiro', 'Niterói', 'Petrópolis', 'Nova Iguaçu'],
    'Rio Grande do Sul':  ['Porto Alegre', 'Caxias do Sul', 'Pelotas'],
    'São Paulo':          ['São Paulo', 'Campinas', 'Santos', 'Ribeirão Preto', 'São Bernardo do Campo'],
  },

  'Argentina': {
    'Buenos Aires':       ['Buenos Aires', 'La Plata', 'Mar del Plata', 'Bahía Blanca', 'Quilmes'],
    'Córdoba':            ['Córdoba', 'Villa María', 'Río Cuarto'],
    'Mendoza':            ['Mendoza', 'San Rafael', 'Godoy Cruz'],
    'Salta':              ['Salta', 'Tartagal', 'Orán'],
    'Santa Fe':           ['Rosario', 'Santa Fe', 'Rafaela'],
    'Tucumán':            ['San Miguel de Tucumán', 'Yerba Buena', 'Concepción'],
  },

  'Germany': {
    'Baden-Württemberg':         ['Stuttgart', 'Mannheim', 'Karlsruhe', 'Freiburg', 'Heidelberg'],
    'Bavaria':                   ['Munich', 'Nuremberg', 'Augsburg', 'Regensburg', 'Ingolstadt'],
    'Berlin':                    ['Berlin'],
    'Brandenburg':               ['Potsdam', 'Cottbus', 'Brandenburg an der Havel'],
    'Bremen':                    ['Bremen', 'Bremerhaven'],
    'Hamburg':                   ['Hamburg'],
    'Hesse':                     ['Frankfurt', 'Wiesbaden', 'Kassel', 'Darmstadt'],
    'Lower Saxony':              ['Hanover', 'Braunschweig', 'Osnabrück', 'Oldenburg'],
    'North Rhine-Westphalia':    ['Cologne', 'Düsseldorf', 'Dortmund', 'Essen', 'Duisburg', 'Bochum', 'Wuppertal'],
    'Saxony':                    ['Leipzig', 'Dresden', 'Chemnitz', 'Zwickau'],
  },

  'France': {
    'Auvergne-Rhône-Alpes':      ['Lyon', 'Grenoble', 'Saint-Étienne', 'Clermont-Ferrand', 'Annecy'],
    'Bretagne':                  ['Rennes', 'Brest', 'Quimper', 'Lorient'],
    'Grand Est':                 ['Strasbourg', 'Reims', 'Metz', 'Nancy'],
    'Hauts-de-France':           ['Lille', 'Amiens', 'Roubaix', 'Tourcoing'],
    'Île-de-France':             ['Paris', 'Versailles', 'Boulogne-Billancourt', 'Créteil'],
    'Normandy':                  ['Rouen', 'Caen', 'Le Havre', 'Cherbourg'],
    'Nouvelle-Aquitaine':        ['Bordeaux', 'Limoges', 'Pau', 'Bayonne'],
    'Occitanie':                 ['Toulouse', 'Montpellier', 'Nîmes', 'Perpignan'],
    'Pays de la Loire':          ['Nantes', 'Le Mans', 'Saint-Nazaire', 'Angers'],
    'Provence-Alpes-Côte d\'Azur': ['Marseille', 'Nice', 'Toulon', 'Aix-en-Provence', 'Cannes'],
  },

  'Spain': {
    'Andalusia':          ['Seville', 'Málaga', 'Córdoba', 'Granada', 'Almería'],
    'Aragón':             ['Zaragoza', 'Huesca', 'Teruel'],
    'Basque Country':     ['Bilbao', 'San Sebastián', 'Vitoria-Gasteiz'],
    'Canary Islands':     ['Las Palmas', 'Santa Cruz de Tenerife'],
    'Castile and León':   ['Valladolid', 'Burgos', 'Salamanca', 'León'],
    'Catalonia':          ['Barcelona', 'Badalona', 'Hospitalet de Llobregat', 'Tarragona'],
    'Community of Madrid': ['Madrid', 'Alcalá de Henares', 'Leganés', 'Móstoles'],
    'Galicia':            ['A Coruña', 'Vigo', 'Santiago de Compostela', 'Ferrol'],
    'Murcia':             ['Murcia', 'Cartagena', 'Lorca'],
    'Valencian Community': ['Valencia', 'Alicante', 'Elche', 'Castellón'],
  },

  'Japan': {
    'Aichi':              ['Nagoya', 'Toyohashi', 'Toyota', 'Okazaki'],
    'Fukuoka':            ['Fukuoka', 'Kitakyushu', 'Kurume', 'Omuta'],
    'Hiroshima':          ['Hiroshima', 'Fukuyama', 'Kure', 'Onomichi'],
    'Hokkaido':           ['Sapporo', 'Asahikawa', 'Hakodate', 'Obihiro'],
    'Hyogo':              ['Kobe', 'Himeji', 'Amagasaki', 'Nishinomiya'],
    'Kanagawa':           ['Yokohama', 'Kawasaki', 'Sagamihara', 'Fujisawa'],
    'Kyoto':              ['Kyoto', 'Uji', 'Muko'],
    'Osaka':              ['Osaka', 'Sakai', 'Higashiosaka', 'Hirakata'],
    'Saitama':            ['Saitama', 'Kawaguchi', 'Kawagoe', 'Tokorozawa'],
    'Tokyo':              ['Tokyo', 'Shinjuku', 'Shibuya', 'Shinagawa', 'Hachioji'],
  },

  'China': {
    'Beijing':            ['Beijing'],
    'Chongqing':          ['Chongqing', 'Wanzhou', 'Yongchuan'],
    'Fujian':             ['Fuzhou', 'Xiamen', 'Quanzhou', 'Zhangzhou'],
    'Guangdong':          ['Guangzhou', 'Shenzhen', 'Dongguan', 'Foshan', 'Zhuhai', 'Shantou'],
    'Hubei':              ['Wuhan', 'Yichang', 'Xiangyang', 'Jingzhou'],
    'Jiangsu':            ['Nanjing', 'Suzhou', 'Wuxi', 'Changzhou', 'Nantong'],
    'Liaoning':           ['Shenyang', 'Dalian', 'Anshan', 'Fushun'],
    'Shaanxi':            ['Xi\'an', 'Baoji', 'Xianyang', 'Tongchuan'],
    'Shandong':           ['Jinan', 'Qingdao', 'Zibo', 'Linyi'],
    'Shanghai':           ['Shanghai'],
    'Sichuan':            ['Chengdu', 'Mianyang', 'Nanchong', 'Leshan'],
    'Tianjin':            ['Tianjin'],
    'Zhejiang':           ['Hangzhou', 'Ningbo', 'Wenzhou', 'Shaoxing'],
  },
};

export const COUNTRY_LIST = Object.keys(COUNTRIES_STATES_CITIES).sort();

export function getStates(country: string): string[] {
  return Object.keys(COUNTRIES_STATES_CITIES[country] ?? {}).sort();
}

export function getCities(country: string, state: string): string[] {
  return COUNTRIES_STATES_CITIES[country]?.[state] ?? [];
}

// Heights from 140cm to 220cm
function cmToFtIn(cm: number): string {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${ft}'${inches}"`;
}

export const HEIGHT_OPTIONS: { value: string; label: string }[] = Array.from(
  { length: 81 },
  (_, i) => {
    const cm = 140 + i;
    return { value: `${cm}cm`, label: `${cm} cm (${cmToFtIn(cm)})` };
  }
);
