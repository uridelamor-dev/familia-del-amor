const companies = [
  {
    name: "La Tapeta",
    desc: "Locales con ambiente y buen rollo.",
    logo: "assets/logos/6.svg",
    slug: "la-tapeta",
    photo: "",
    locations: [
      "Blanes · Calle Muralla 21",
      "Lloret · Calle Sant Pere 84",
      "Girona · Avinguda Sant Francesc 7"
    ]
  },
  {
    name: "Cooperativa",
    desc: "Tradición local y cocina con identidad.",
    logo: "assets/logos/7.svg",
    slug: "cooperativa",
    photo: "uploads/gallery/Cooperativa_208.jpg",
    locations: ["Blanes · Calle Muralla 28"]
  },
  {
    name: "Can Mateu",
    desc: "Cocina auténtica en el corazón de Tordera.",
    logo: "assets/logos/3.svg",
    slug: "can-mateu",
    photo: "uploads/gallery/CanMateu_STR04757.jpg",
    locations: ["Tordera · Plaça Concòrdia 7"]
  },
  {
    name: "La Tapa Ibérica",
    desc: "Sabores ibéricos y tapeo con carácter.",
    logo: "assets/logos/4.svg",
    slug: "la-tapa-iberica",
    photo: "uploads/gallery/TapaIberica_STR05479.jpg",
    locations: ["Tordera · Camí Ral 6"]
  },
  {
    name: "Botiga d'en Mateu",
    desc: "Tienda de embutidos y jamonería.",
    logo: "assets/logos/2.svg",
    slug: "botiga-mateu",
    photo: "",
    locations: ["Tordera · Camí Ral 8"]
  },
  {
    name: "Viva la Pepa",
    desc: "Fiestas al aire libre y eventos memorables.",
    logo: "assets/logos/5.svg",
    slug: "viva-la-pepa",
    photo: "",
    locations: ["Eventos itinerantes"]
  }
];

const i18n = {
  es: {
    hero_eyebrow: "Grupo familiar de empresas",
    hero_title: "Familia del Amor",
    hero_sub: "Sabor, tradición y alegría compartida en cada local.",
    hero_cta: "Reservar mesa",
    hero_cta_2: "Ver locales",
    about_title: "Sobre nosotros",
    about_text:
      "Somos un grupo familiar de tercera generación, dedicados a la atención al cliente desde los años 70. Llevamos décadas trabajando de cara al público y nuestra obsesión es que cada persona se sienta como en casa: cercana, cuidada y bien atendida.",
    about_tile:
      "Bares de tapas con mucho ambiente, cocina honesta y un equipo que cuida cada detalle.",
    companies_title: "Nuestras empresas",
    companies_sub: "Cada local con su carácter, historia y sabor.",
    history_title: "Historia y valores",
    history_sub: "Nuestra manera de hacer las cosas, desde dentro.",
    team_title: "Equipo y familia",
    team_text: "Somos una familia que crece con cada local y cada historia compartida.",
    events_title: "Eventos y experiencias",
    events_text: "Viva la Pepa: fiestas al aire libre y celebraciones a medida.",
    events_cta: "Pedir información",
    news_title: "Anuncios y novedades",
    news_sub: "Lo último del grupo y sus locales.",
    news_empty: "Pronto: anuncios y novedades.",
    reservations_title: "Reservas",
    reservations_sub: "Reserva confirmada al instante.",
    reservation_local: "Local",
    reservation_people: "Personas",
    reservation_day: "Día",
    reservation_time: "Hora",
    reservation_phone: "Teléfono",
    reservation_name: "Nombre de la reserva",
    reservation_submit: "Confirmar reserva",
    jobs_title: "Trabaja con nosotros",
    jobs_text: "Envíanos tu CV y cuéntanos en qué área te gustaría aportar.",
    faq_title: "Preguntas frecuentes",
    faq_sub: "Resolvemos las dudas más habituales.",
    faq_empty: "Pronto: preguntas frecuentes.",
    contact_title: "Contacto",
    contact_text: "Para cualquier consulta, escríbenos.",
    legal_title: "Legal y privacidad",
    legal_text: "Políticas de privacidad, cookies y condiciones.",
    popup_title: "¡Bienvenidos a Familia del Amor!",
    popup_text: "Déjanos tus datos y recibe un 10% de descuento.",
    lead_name: "Nombre",
    lead_lastname: "Apellidos",
    lead_birth: "Fecha de nacimiento",
    lead_city: "Población",
    lead_phone: "Teléfono",
    lead_email: "Correo",
    lead_gender: "Género",
    lead_consent: "Acepto recibir comunicaciones y la política de privacidad.",
    lead_submit: "Recibir mi descuento",
    reservation_local_q: "¿En qué local?",
    reservation_day_q: "¿Qué día?",
    reservation_time_q: "¿A qué hora?",
    reservation_people_q: "¿Cuántos?",
    reservation_people_unit: "personas",
    reservation_phone_q: "Teléfono",
    reservation_name_q: "Nombre de la reserva",
    time_slot_lunch: "Mediodía",
    time_slot_dinner: "Cena",
    nav_locals: "Locales",
    nav_reservations: "Reservar",
    nav_jobs: "Trabaja",
    nav_contact: "Contacto",
    locales_see_all: "Ver todos los locales →",
    gallery_title: "Galería",
    gallery_sub: "Momentos y platos de nuestros locales.",
    reviews_title: "Lo que dicen nuestros clientes",
    reviews_sub: "⭐⭐⭐⭐⭐ Valoración media en Google",
    contact_h: "Contacto",
    contact_link: "hola@familia-del-amor.com",
    ph_choose_date: "Elige fecha",
    ph_birth_date: "dd/mm/aaaa",
    ph_booking_name: "¿A nombre de quién?",
    err_select_local: "Selecciona un local.",
    err_select_date: "Selecciona una fecha.",
    err_select_time: "Selecciona una hora.",
    reservation_at: "a las",
    success_reserva: "Reserva confirmada",
    err_generic: "No se pudo completar. Inténtalo de nuevo.",
    success_lead: "¡Descuento activado!",
    success_hr: "Candidatura enviada. Gracias.",
    err_hr: "No se pudo enviar. Inténtalo de nuevo.",
    reservation_success_back: "Hacer otra reserva",
    strip_title: "¿Aún no tienes tu 10%?",
    strip_sub: "Déjanos tus datos y te enviamos tu descuento ahora.",
    strip_cta: "Consigue tu descuento",
    nav_about: "Nosotros",
    nav_events: "Eventos",
    jobs_eyebrow: "Equipo",
    jobs_hero_sub: "Buscamos personas con vocación, ganas de crecer y amor por la hostelería. Si quieres formar parte de nuestra familia, aquí es el sitio.",
    jobs_open_title: "Vacantes activas",
    jobs_open_sub: "Plazas disponibles ahora mismo en nuestros locales.",
    jobs_apply_title: "Envía tu candidatura",
    jobs_apply_sub: "¿No ves tu puesto ideal? Cuéntanos de todas formas — siempre buscamos buen talento.",
    jobs_position: "Puesto de interés",
    jobs_message: "Mensaje (opcional)",
    jobs_cv: "CV (PDF, opcional)",
    jobs_submit: "Enviar candidatura",
    events_eyebrow: "Celebraciones",
    events_hero_sub: "Cumpleaños, comuniones, eventos de empresa, cenas de equipo… lo organizamos todo para que tú solo tengas que disfrutar.",
    events_types_title: "¿Qué celebramos juntos?",
    events_wa_cta: "Consultar por WhatsApp",
    events_mail_cta: "Escribirnos por email",
    events_contact_title: "Cuéntanos tu idea",
    events_contact_sub: "Sin compromiso. Te respondemos en menos de 24 horas y buscamos la mejor opción para tu celebración.",
    event_type_birthday: "Cumpleaños",
    event_type_birthday_desc: "Celebra tu día rodeado de los tuyos. Menús a medida, decoración y mucho cariño.",
    event_type_wedding: "Bodas y comuniones",
    event_type_wedding_desc: "Espacios con encanto para los momentos que no se olvidan. Hablamos y lo diseñamos juntos.",
    event_type_business: "Eventos de empresa",
    event_type_business_desc: "Cenas de equipo, presentaciones, team-building… Te ofrecemos el espacio y la experiencia.",
    event_type_pepa_desc: "Nuestra marca de fiestas al aire libre y eventos a medida para grupos grandes. Siempre con buena música y mejor ambiente.",
    history_title: "Historia y valores",
    history_sub: "Nuestra manera de hacer las cosas, desde dentro.",
    history_p1: "Desde hace tres generaciones, nuestra familia ha vivido de una misma vocación: cuidar de la gente.",
    history_p2: "Todo empezó con nuestros abuelos, Esteban y Herminia, que después de trabajar durante más de una década en Alemania regresaron a casa para abrir una pequeña tienda de barrio. De esas de toda la vida, donde había un poco de todo, pero sobre todo había cercanía, confianza y una atención al cliente que dejó huella en mucha gente.",
    history_p3: "Nuestros padres, Mateo y Pili, se conocieron siendo muy jóvenes y emprendieron juntos su camino en el mundo de la alimentación y la hostelería. Desde los 18 años, codo con codo, fueron construyendo una red de tiendas especializadas y restaurantes que durante años formaron parte del día a día de muchas familias. Como tantos otros negocios familiares, la crisis los obligó a reinventarse y empezar de nuevo.",
    history_p4: "Fue entonces cuando decidimos centrarnos plenamente en la restauración, manteniendo intacta la esencia con la que habíamos crecido: ofrecer un producto de calidad, un trato cercano y espacios donde la gente se sintiera como en casa.",
    history_p5: "Hoy, la tercera generación —Mateo y Pili junto a sus hijos Nerea, Uriel y Boris— seguimos trabajando unidos en cada proyecto, gestionando restaurantes, una tienda especializada y nuestra marca de eventos, Viva la Pepa.",
    history_p6: "Más allá de los locales o los negocios, lo que realmente nos mueve sigue siendo lo mismo que movía a nuestros abuelos hace tantos años: crear buenos momentos alrededor de una mesa, cuidar cada detalle y conseguir que quien venga una vez, siempre quiera volver."
  },
  ca: {
    hero_eyebrow: "Grup familiar d'empreses",
    hero_title: "Família de l'Amor",
    hero_sub: "Sabor, tradició i alegria compartida a cada local.",
    hero_cta: "Reservar taula",
    hero_cta_2: "Veure locals",
    about_title: "Sobre nosaltres",
    about_text:
      "Som un grup familiar de tercera generació, dedicats a l'atenció al client des dels anys 70. Portem dècades treballant de cara al públic i la nostra obsessió és que cada persona se senti com a casa: propera, cuidada i ben atesa.",
    about_tile:
      "Bars de tapes amb molt ambient, cuina honesta i un equip que cuida cada detall.",
    companies_title: "Les nostres empreses",
    companies_sub: "Cada local amb el seu caràcter, història i sabor.",
    history_title: "Història i valors",
    history_sub: "La nostra manera de fer les coses, des de dins.",
    team_title: "Equip i família",
    team_text: "Som una família que creix amb cada local i cada història compartida.",
    events_title: "Esdeveniments i experiències",
    events_text: "Viva la Pepa: festes a l'aire lliure i celebracions a mida.",
    events_cta: "Demanar informació",
    news_title: "Anuncis i novetats",
    news_sub: "L'últim del grup i els seus locals.",
    news_empty: "Ben aviat: anuncis i novetats.",
    reservations_title: "Reserves",
    reservations_sub: "Reserva confirmada a l'instant.",
    reservation_local: "Local",
    reservation_people: "Persones",
    reservation_day: "Dia",
    reservation_time: "Hora",
    reservation_phone: "Telèfon",
    reservation_name: "Nom de la reserva",
    reservation_submit: "Confirmar reserva",
    jobs_title: "Treballa amb nosaltres",
    jobs_text: "Envia'ns el teu CV i explica'ns en quin àmbit t'agradaria aportar.",
    faq_title: "Preguntes freqüents",
    faq_sub: "Resolem els dubtes més habituals.",
    faq_empty: "Ben aviat: preguntes freqüents.",
    contact_title: "Contacte",
    contact_text: "Per a qualsevol consulta, escriu-nos.",
    legal_title: "Legal i privacitat",
    legal_text: "Polítiques de privacitat, cookies i condicions.",
    popup_title: "Benvinguts a Família de l'Amor!",
    popup_text: "Deixa'ns les teves dades i rep un 10% de descompte.",
    lead_name: "Nom",
    lead_lastname: "Cognoms",
    lead_birth: "Data de naixement",
    lead_city: "Població",
    lead_phone: "Telèfon",
    lead_email: "Correu",
    lead_gender: "Gènere",
    lead_consent: "Accepto rebre comunicacions i la política de privacitat.",
    lead_submit: "Rebre el meu descompte",
    reservation_local_q: "¿En quin local?",
    reservation_day_q: "¿Quin dia?",
    reservation_time_q: "¿A quina hora?",
    reservation_people_q: "¿Quants?",
    reservation_people_unit: "persones",
    reservation_phone_q: "Telèfon",
    reservation_name_q: "Nom de la reserva",
    time_slot_lunch: "Migdia",
    time_slot_dinner: "Sopar",
    nav_locals: "Locals",
    nav_reservations: "Reservar",
    nav_jobs: "Treballa",
    locales_see_all: "Veure tots els locals →",
    nav_contact: "Contacte",
    gallery_title: "Galeria",
    gallery_sub: "Moments i plats dels nostres locals.",
    reviews_title: "El que diuen els nostres clients",
    reviews_sub: "⭐⭐⭐⭐⭐ Valoració mitjana a Google",
    contact_h: "Contacte",
    contact_link: "hola@familia-del-amor.com",
    ph_choose_date: "Tria la data",
    ph_birth_date: "dd/mm/aaaa",
    ph_booking_name: "¿A nom de qui?",
    err_select_local: "Selecciona un local.",
    err_select_date: "Selecciona una data.",
    err_select_time: "Selecciona una hora.",
    reservation_at: "a les",
    success_reserva: "Reserva confirmada",
    err_generic: "No s'ha pogut completar. Torna-ho a intentar.",
    success_lead: "¡Descompte activat!",
    success_hr: "Candidatura enviada. Gràcies.",
    err_hr: "No s'ha pogut enviar. Torna-ho a intentar.",
    reservation_success_back: "Fer una altra reserva",
    strip_title: "Encara no tens el teu 10%?",
    strip_sub: "Deixa'ns les teves dades i t'enviem el teu descompte ara.",
    strip_cta: "Aconsegueix el teu descompte",
    nav_about: "Nosaltres",
    nav_events: "Esdeveniments",
    jobs_eyebrow: "Equip",
    jobs_hero_sub: "Busquem persones amb vocació, ganes de créixer i amor per l'hostaleria. Si vols formar part de la nostra família, aquí és el lloc.",
    jobs_open_title: "Vacants actives",
    jobs_open_sub: "Places disponibles ara mateix als nostres locals.",
    jobs_apply_title: "Envia la teva candidatura",
    jobs_apply_sub: "No veus el teu lloc ideal? Explica'ns-ho igualment — sempre busquem bon talent.",
    jobs_position: "Lloc d'interès",
    jobs_message: "Missatge (opcional)",
    jobs_cv: "CV (PDF, opcional)",
    jobs_submit: "Enviar candidatura",
    events_eyebrow: "Celebracions",
    events_hero_sub: "Aniversaris, comunions, esdeveniments d'empresa, sopars d'equip… ho organitzem tot perquè tu només hagis de gaudir.",
    events_types_title: "Què celebrem junts?",
    events_wa_cta: "Consultar per WhatsApp",
    events_mail_cta: "Escriure'ns per correu",
    events_contact_title: "Explica'ns la teva idea",
    events_contact_sub: "Sense compromís. Et responem en menys de 24 hores i busquem la millor opció per a la teva celebració.",
    event_type_birthday: "Aniversaris",
    event_type_birthday_desc: "Celebra el teu dia envoltat dels teus. Menús a mida, decoració i molt de carinyo.",
    event_type_wedding: "Bodes i comunions",
    event_type_wedding_desc: "Espais amb encant per als moments que no s'obliden. Parlem-ne i ho dissenyem junts.",
    event_type_business: "Esdeveniments d'empresa",
    event_type_business_desc: "Sopars d'equip, presentacions, team-building… Et oferim l'espai i l'experiència.",
    event_type_pepa_desc: "La nostra marca de festes a l'aire lliure i esdeveniments a mida per a grups grans. Sempre amb bona música i millor ambient.",
    history_title: "Història i valors",
    history_sub: "La nostra manera de fer les coses, des de dins.",
    history_p1: "Des de fa tres generacions, la nostra família ha viscut d'una mateixa vocació: cuidar de la gent.",
    history_p2: "Tot va començar amb els nostres avis, Esteban i Herminia, que després de treballar durant més d'una dècada a Alemanya van tornar a casa per obrir una petita botiga de barri. D'aquelles de tota la vida, on hi havia una mica de tot, però sobretot hi havia proximitat, confiança i una atenció al client que va deixar empremta en molta gent.",
    history_p3: "Els nostres pares, Mateo i Pili, es van conèixer molt joves i van emprendre junts el seu camí en el món de l'alimentació i l'hostaleria. Des dels 18 anys, colze a colze, van anar construint una xarxa de botigues especialitzades i restaurants que durant anys van formar part del dia a dia de moltes famílies. Com tants altres negocis familiars, la crisi els va obligar a reinventar-se i tornar a començar.",
    history_p4: "Va ser aleshores quan vam decidir centrar-nos plenament en la restauració, mantenint intacta l'essència amb la qual havíem crescut: oferir un producte de qualitat, un tracte proper i espais on la gent se sentís com a casa.",
    history_p5: "Avui, la tercera generació —Mateo i Pili amb els seus fills Nerea, Uriel i Boris— continuem treballant units en cada projecte, gestionant restaurants, una botiga especialitzada i la nostra marca d'esdeveniments, Viva la Pepa.",
    history_p6: "Més enllà dels locals o els negocis, el que realment ens mou continua sent el mateix que movia els nostres avis fa tants anys: crear bons moments al voltant d'una taula, cuidar cada detall i aconseguir que qui vingui un cop, sempre vulgui tornar."
  },
  en: {
    hero_eyebrow: "Family business group",
    hero_title: "Familia del Amor",
    hero_sub: "Flavor, tradition, and shared joy at every venue.",
    hero_cta: "Book a table",
    hero_cta_2: "See venues",
    about_title: "About us",
    about_text:
      "We are a third-generation family business, dedicated to customer care since the 1970s. We have spent decades working face to face, and our obsession is that every person feels at home: welcomed, cared for, and well served.",
    about_tile:
      "Tapas bars with great atmosphere, honest cooking, and a team that cares about every detail.",
    companies_title: "Our companies",
    companies_sub: "Each venue with its own character, history, and flavor.",
    history_title: "History and values",
    history_sub: "Our way of doing things, from the inside.",
    team_title: "Team and family",
    team_text: "We are a family that grows with every venue and shared story.",
    events_title: "Events and experiences",
    events_text: "Viva la Pepa: outdoor parties and tailor-made celebrations.",
    events_cta: "Request info",
    news_title: "News and updates",
    news_sub: "The latest from the group and its venues.",
    news_empty: "Coming soon: news and updates.",
    reservations_title: "Reservations",
    reservations_sub: "Instant reservation confirmation.",
    reservation_local: "Venue",
    reservation_people: "Guests",
    reservation_day: "Date",
    reservation_time: "Time",
    reservation_phone: "Phone",
    reservation_name: "Booking name",
    reservation_submit: "Confirm reservation",
    jobs_title: "Work with us",
    jobs_text: "Send us your CV and tell us which area you'd like to join.",
    faq_title: "FAQ",
    faq_sub: "We answer the most common questions.",
    faq_empty: "Coming soon: FAQs.",
    contact_title: "Contact",
    contact_text: "For any questions, get in touch.",
    legal_title: "Legal and privacy",
    legal_text: "Privacy policy, cookies and terms.",
    popup_title: "Welcome to Familia del Amor!",
    popup_text: "Leave your details and receive a 10% discount.",
    lead_name: "First name",
    lead_lastname: "Last name",
    lead_birth: "Date of birth",
    lead_city: "City",
    lead_phone: "Phone",
    lead_email: "Email",
    lead_gender: "Gender",
    lead_consent: "I accept communications and the privacy policy.",
    lead_submit: "Claim my discount",
    reservation_local_q: "Which venue?",
    reservation_day_q: "Which day?",
    reservation_time_q: "What time?",
    reservation_people_q: "How many?",
    reservation_people_unit: "guests",
    reservation_phone_q: "Phone",
    reservation_name_q: "Booking name",
    time_slot_lunch: "Lunch",
    time_slot_dinner: "Dinner",
    nav_locals: "Venues",
    nav_reservations: "Book",
    locales_see_all: "See all venues →",
    nav_jobs: "Jobs",
    nav_contact: "Contact",
    gallery_title: "Gallery",
    gallery_sub: "Moments and dishes from our venues.",
    reviews_title: "What our customers say",
    reviews_sub: "⭐⭐⭐⭐⭐ Average Google rating",
    contact_h: "Contact",
    contact_link: "hola@familia-del-amor.com",
    ph_choose_date: "Choose date",
    ph_birth_date: "dd/mm/yyyy",
    ph_booking_name: "Name for the reservation",
    err_select_local: "Please select a venue.",
    err_select_date: "Please select a date.",
    err_select_time: "Please select a time.",
    reservation_at: "at",
    success_reserva: "Reservation confirmed",
    err_generic: "Could not complete. Please try again.",
    success_lead: "Discount activated!",
    success_hr: "Application sent. Thank you.",
    err_hr: "Could not send. Please try again.",
    reservation_success_back: "Make another reservation",
    strip_title: "Don't have your 10% yet?",
    strip_sub: "Leave your details and we'll send your discount right away.",
    strip_cta: "Get my discount",
    nav_about: "About us",
    nav_events: "Events",
    jobs_eyebrow: "Team",
    jobs_hero_sub: "We're looking for people with passion, drive and a love for hospitality. If you want to be part of our family, this is the place.",
    jobs_open_title: "Current openings",
    jobs_open_sub: "Positions available right now across our venues.",
    jobs_apply_title: "Send your application",
    jobs_apply_sub: "Don't see the perfect role? Tell us anyway — we're always looking for great talent.",
    jobs_position: "Role of interest",
    jobs_message: "Message (optional)",
    jobs_cv: "CV (PDF, optional)",
    jobs_submit: "Send application",
    events_eyebrow: "Celebrations",
    events_hero_sub: "Birthdays, communions, corporate events, team dinners… we organise everything so you only have to enjoy it.",
    events_types_title: "What shall we celebrate?",
    events_wa_cta: "Ask on WhatsApp",
    events_mail_cta: "Email us",
    events_contact_title: "Tell us your idea",
    events_contact_sub: "No commitment. We'll get back to you within 24 hours and find the best option for your celebration.",
    event_type_birthday: "Birthdays",
    event_type_birthday_desc: "Celebrate your day with the people you love. Custom menus, decoration and lots of care.",
    event_type_wedding: "Weddings & communions",
    event_type_wedding_desc: "Charming spaces for unforgettable moments. Let's talk and design it together.",
    event_type_business: "Corporate events",
    event_type_business_desc: "Team dinners, presentations, team-building… We provide the space and the experience.",
    event_type_pepa_desc: "Our outdoor festival and events brand for large groups. Always with great music and even better vibes.",
    history_title: "History and values",
    history_sub: "Our way of doing things, from the inside.",
    history_p1: "For three generations, our family has lived by a single vocation: caring for people.",
    history_p2: "It all started with our grandparents, Esteban and Herminia, who after working for more than a decade in Germany came back home to open a small neighbourhood shop. The old-fashioned kind, where you could find a bit of everything, but above all there was warmth, trust, and a way of looking after customers that left a lasting impression on many people.",
    history_p3: "Our parents, Mateo and Pili, met when they were very young and set out together on their path in the world of food and hospitality. From the age of 18, side by side, they built a network of specialised shops and restaurants that for years were part of the daily life of many families. Like so many family businesses, the financial crisis forced them to reinvent themselves and start again.",
    history_p4: "That was when we decided to focus entirely on hospitality, keeping intact the essence we had grown up with: offering quality products, a personal touch, and spaces where people felt at home.",
    history_p5: "Today, the third generation — Mateo and Pili together with their children Nerea, Uriel and Boris — continue working side by side on every project, running restaurants, a specialised shop and our events brand, Viva la Pepa.",
    history_p6: "Beyond the venues and the businesses, what truly drives us is still the same thing that drove our grandparents all those years ago: creating great moments around a table, caring about every detail, and making sure that whoever comes once always wants to come back."
  }
};

const i18nDates = {
  es: {
    months: [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre"
    ],
    weekdays: ["L", "M", "X", "J", "V", "S", "D"]
  },
  ca: {
    months: [
      "gener",
      "febrer",
      "març",
      "abril",
      "maig",
      "juny",
      "juliol",
      "agost",
      "setembre",
      "octubre",
      "novembre",
      "desembre"
    ],
    weekdays: ["Dl", "Dt", "Dc", "Dj", "Dv", "Ds", "Dg"]
  },
  en: {
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ],
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  }
};

let currentLang = "es";
let datepickerApi = null;
const LANG_KEY = "familia_lang";
let contentCache = {};

function renderCompanies() {
  const container = document.getElementById("companies");
  if (!container) return;
  container.innerHTML = "";
  companies.forEach((c) => {
    const menuUrl = contentCache[`local_${c.slug}_menu_pdf`] || "";
    const almuUrl = contentCache[`local_${c.slug}_menu_almuerzo_pdf`] || "";
    const menuBtns = [
      menuUrl ? `<a class="btn ghost" href="${menuUrl}" target="_blank" rel="noopener" style="font-size:0.75rem;padding:0.4rem 0.8rem">Carta</a>` : "",
      almuUrl ? `<a class="btn ghost" href="${almuUrl}" target="_blank" rel="noopener" style="font-size:0.75rem;padding:0.4rem 0.8rem">Menú mediodía</a>` : "",
    ].filter(Boolean).join("");
    const menuRow = menuBtns ? `<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.6rem">${menuBtns}</div>` : "";
    const card = document.createElement("div");
    card.className = "card";
    const bgStyle = c.photo ? `style="background-image:url('${c.photo}')"` : "";
    card.innerHTML = `
      <a class="card-link" href="local.html?slug=${c.slug}">
        <div class="card-logo" ${bgStyle}>
          <img src="${c.logo}" alt="${c.name}" />
        </div>
        <h3>${c.name}</h3>
        <p>${c.desc}</p>
      </a>
      ${menuRow}
    `;
    container.appendChild(card);
  });
}

function setLang(lang) {
  document.documentElement.lang = lang;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (i18n[lang] && i18n[lang][key]) {
      el.textContent = i18n[lang][key];
    }
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const key = el.getAttribute("data-i18n-ph");
    if (i18n[lang] && i18n[lang][key]) {
      el.placeholder = i18n[lang][key];
    }
  });

  applyContentOverrides();

  document.querySelectorAll(".lang button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  if (datepickerApi) {
    datepickerApi.refresh();
  }
  renderTimePicker();
  renderNewsAndFaq();
}

async function loadContent() {
  try {
    const res = await fetch("/api/content");
    const data = await res.json();
    if (data.ok) {
      contentCache = data.data || {};
      applyContentOverrides();
      renderCompanies();
    }
  } catch {
    // ignore
  }
}

function applyContentOverrides() {
  document.querySelectorAll("[data-content-key]").forEach((el) => {
    if (document.activeElement === el) return;
    const key = el.getAttribute("data-content-key");
    const langKey = `${key}_${currentLang}`;
    if (contentCache[langKey]) {
      el.textContent = contentCache[langKey];
      return;
    }
    if (contentCache[key]) {
      el.textContent = contentCache[key];
    }
  });
  if (contentCache.site_logo_url) {
    const logo = document.getElementById("siteLogo");
    if (logo) logo.src = contentCache.site_logo_url;
  }
  if (contentCache.hero_image_url) {
    document.documentElement.style.setProperty(
      "--hero-image",
      `url(\"${contentCache.hero_image_url}\")`
    );
  }
  renderNewsAndFaq();
  renderGallery();
}

function renderNewsAndFaq() {
  const newsEl = document.getElementById("newsList");
  const faqEl = document.getElementById("faqList");

  if (newsEl) {
    const key = `news_items_${currentLang}`;
    const raw = contentCache[key] || "";
    const items = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    newsEl.innerHTML = items.length
      ? items.map((t) => `<div class="card">${t}</div>`).join("")
      : `<div class="card">${i18n[currentLang].news_empty}</div>`;
  }

  if (faqEl) {
    const key = `faq_items_${currentLang}`;
    const raw = contentCache[key] || "";
    const items = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    faqEl.innerHTML = items.length
      ? items
          .map(
            (t) =>
              `<details class="faq-item"><summary>${t.split("|")[0].trim()}</summary><p>${(t.split("|")[1] || "").trim()}</p></details>`
          )
          .join("")
      : `<div class="card">${i18n[currentLang].faq_empty}</div>`;
  }
}

renderCompanies();
renderLocalesTeaser();

function renderLocalesTeaser() {
  const container = document.getElementById("localesTeaser");
  if (!container) return;
  container.innerHTML = companies.map(c => {
    const bgStyle = c.photo ? `background-image:url('${c.photo}')` : `background-color:#1a1917`;
    const logoEl = !c.photo
      ? `<img class="ltc-logo" src="${c.logo}" alt="${c.name}" />`
      : "";
    return `<a href="local.html?slug=${c.slug}" class="ltc">
      <div class="ltc-bg" style="${bgStyle}"></div>
      ${logoEl}
      <div class="ltc-overlay"></div>
      <div class="ltc-info">
        <span class="ltc-name">${c.name}</span>
        <span class="ltc-loc">${c.locations[0]}</span>
      </div>
    </a>`;
  }).join("");
}

const DEFAULT_GALLERY = [
  "uploads/gallery/Cooperativa_208.jpg",
  "uploads/gallery/TapaIberica_STR05644.jpg",
  "uploads/gallery/CanMateu_STR04942.jpg",
  "uploads/gallery/Cooperativa_181.jpg",
  "uploads/gallery/TapaIberica_STR05479.jpg",
  "uploads/gallery/CanMateu_STR05254.jpg",
  "uploads/gallery/Cooperativa_75.jpg",
  "uploads/gallery/TapaIberica_STR05831.jpg",
  "uploads/gallery/CanMateu_STR04434.jpg",
  "uploads/gallery/Cooperativa_226.jpg",
  "uploads/gallery/TapaIberica_STR05475.jpg",
  "uploads/gallery/CanMateu_STR04757.jpg",
  "uploads/gallery/Cooperativa_1.jpg",
  "uploads/gallery/TapaIberica_STR05620.jpg",
  "uploads/gallery/CanMateu_STR05013.jpg",
  "uploads/gallery/Cooperativa_24.jpg",
  "uploads/gallery/TapaIberica_STR05815.jpg",
  "uploads/gallery/CanMateu_STR04457.jpg",
  "uploads/gallery/TapaIberica_STR05485.jpg",
  "uploads/gallery/CanMateu_STR05090.jpg",
  "uploads/gallery/TapaIberica_STR05538.jpg",
  "uploads/gallery/CanMateu_STR04427.jpg",
];

function renderGallery() {
  const grid = document.getElementById("galeriaGrid");
  if (!grid) return;
  const raw = contentCache.gallery_images || "";
  const saved = raw.split("\n").map(s => s.trim()).filter(Boolean);
  const urls = saved.length ? saved : DEFAULT_GALLERY;

  if (editModeEnabled) {
    grid.style.overflow = "visible";
    grid.innerHTML = urls.map((url, i) => `
      <div class="gallery-edit-slot" data-gallery-idx="${i}">
        <img src="${url}" alt="" />
        <div class="gallery-edit-overlay">
          <span style="color:#fff;font-size:0.78rem;font-weight:700;pointer-events:none">Seleccionar</span>
        </div>
      </div>`).join("") +
      `<div class="gallery-edit-slot gallery-edit-add" data-gallery-add="true">
        <span style="font-size:1.5rem;pointer-events:none">＋</span>
      </div>`;
    return;
  }

  const imgs = urls.map(url =>
    `<div class="carousel-slide"><img src="${url}" alt="Foto del local" loading="lazy" /></div>`
  ).join("");
  grid.innerHTML = `<div class="carousel-track" id="carouselTrack">${imgs}${imgs}</div>`;
  startCarousel();
}

function startCarousel() {
  const track = document.getElementById("carouselTrack");
  if (!track) return;
  let pos = 0;
  const speed = 0.4;
  let paused = false;
  track.parentElement.addEventListener("mouseenter", () => paused = true);
  track.parentElement.addEventListener("mouseleave", () => paused = false);

  function step() {
    if (!paused) {
      pos += speed;
      const half = track.scrollWidth / 2;
      if (pos >= half) pos = 0;
      track.style.transform = `translateX(-${pos}px)`;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Selector de locales ───────────────────────────────────────────────────────

const RESERVA_LOCALS = [
  { value: "La Tapeta - Blanes",           name: "La Tapeta",           sub: "Blanes" },
  { value: "La Tapeta - Lloret",           name: "La Tapeta",           sub: "Lloret de Mar" },
  { value: "La Tapeta - Girona",           name: "La Tapeta",           sub: "Girona" },
  { value: "Cooperativa - Blanes",         name: "Cooperativa",         sub: "Blanes" },
  { value: "Can Mateu - Tordera",          name: "Can Mateu",           sub: "Tordera" },
  { value: "La Tapa Ibérica - Tordera",    name: "La Tapa Ibérica",     sub: "Tordera" },
  { value: "Botiga d'en Mateu - Tordera",  name: "Botiga d'en Mateu",   sub: "Tordera" },
];

function renderLocalPicker() {
  const grid = document.getElementById("localGrid");
  if (!grid) return;
  grid.innerHTML = RESERVA_LOCALS.map((l) => `
    <button type="button" class="local-chip" data-value="${l.value}">
      <span class="chip-name">${l.name}</span>
      <span class="chip-sub">${l.sub}</span>
    </button>`).join("");

  grid.querySelectorAll(".local-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".local-chip").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      document.getElementById("localValue").value = btn.dataset.value;
    });
  });
}

renderLocalPicker();

// ── Stepper de personas ────────────────────────────────────────────────────────

let personasCount = 2;

function updateStepper() {
  document.getElementById("personasDisplay").textContent = personasCount;
  document.getElementById("personasValue").value = personasCount;
}

document.getElementById("personasMinus")?.addEventListener("click", () => {
  if (personasCount > 1) { personasCount--; updateStepper(); }
});
document.getElementById("personasPlus")?.addEventListener("click", () => {
  if (personasCount < 20) { personasCount++; updateStepper(); }
});

// ── Selector de hora por turnos ────────────────────────────────────────────────

const TIME_SLOTS_RAW = {
  lunch: ["12:30","13:00","13:30","14:00","14:30","15:00","15:30"],
  dinner: ["19:30","20:00","20:30","21:00","21:30","22:00","22:30"]
};

function renderTimePicker() {
  const container = document.getElementById("timePicker");
  if (!container) return;
  const selectedTime = document.getElementById("horaValue")?.value;
  const t = i18n[currentLang] || i18n.es;
  const sections = [
    { key: "lunch",  label: t.time_slot_lunch,  slots: TIME_SLOTS_RAW.lunch },
    { key: "dinner", label: t.time_slot_dinner, slots: TIME_SLOTS_RAW.dinner }
  ];
  container.innerHTML = sections.map(({ label, slots }) => `
    <div class="time-section">
      <div class="time-section-label">${label}</div>
      <div class="time-pills">
        ${slots.map((s) => `<button type="button" class="time-pill${selectedTime === s ? " selected" : ""}" data-time="${s}">${s}</button>`).join("")}
      </div>
    </div>`).join("");

  container.querySelectorAll(".time-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".time-pill").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      document.getElementById("horaValue").value = btn.dataset.time;
    });
  });
}

renderTimePicker();

function setupDatePicker() {
  let activeInput = null;
  let activeHidden = null;
  let activeMode = "future";
  let current = new Date();
  let selectedIso = "";

  let picker = document.getElementById("datePicker");
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "datePicker";
    picker.className = "datepicker hidden";
    picker.innerHTML = `
      <div class="dp-head">
        <button class="dp-nav" data-dir="-1" aria-label="Mes anterior">‹</button>
        <div class="dp-title" id="dpTitle">
          <select id="dpMonthSel" style="font:inherit;background:transparent;border:none;cursor:pointer;font-weight:600"></select>
          <select id="dpYearSel" style="font:inherit;background:transparent;border:none;cursor:pointer;font-weight:600"></select>
        </div>
        <button class="dp-nav" data-dir="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="dp-grid" id="dpWeekdays"></div>
      <div class="dp-grid" id="dpDays"></div>
    `;
    document.body.appendChild(picker);
  }

  const dpTitle = picker.querySelector("#dpTitle");
  const dpWeekdays = picker.querySelector("#dpWeekdays");
  const dpDays = picker.querySelector("#dpDays");

  function refreshWeekdays() {
    const locale = i18nDates[currentLang] || i18nDates.es;
    dpWeekdays.innerHTML = locale.weekdays
      .map((d) => `<div class="dp-weekday">${d}</div>`)
      .join("");
  }

  refreshWeekdays();

  function formatDisplay(date) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatIso(date) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  }

  function setSelected(date) {
    selectedIso = formatIso(date);
    if (activeInput) activeInput.value = formatDisplay(date);
    if (activeHidden) activeHidden.value = selectedIso;
  }

  function isDisabled(date) {
    if (activeMode !== "future") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  }

  const dpMonthSel = picker.querySelector("#dpMonthSel");
  const dpYearSel = picker.querySelector("#dpYearSel");

  function populateSelects() {
    const locale = i18nDates[currentLang] || i18nDates.es;
    dpMonthSel.innerHTML = locale.months.map((m, i) =>
      `<option value="${i}">${m}</option>`).join("");
    const nowYear = new Date().getFullYear();
    const minYear = activeMode === "birth" ? 1920 : nowYear;
    const maxYear = activeMode === "birth" ? nowYear : nowYear + 2;
    let yearHtml = "";
    for (let y = maxYear; y >= minYear; y--) yearHtml += `<option value="${y}">${y}</option>`;
    dpYearSel.innerHTML = yearHtml;
  }

  dpMonthSel.addEventListener("change", () => {
    current = new Date(current.getFullYear(), Number(dpMonthSel.value), 1);
    renderCalendar();
  });
  dpYearSel.addEventListener("change", () => {
    current = new Date(Number(dpYearSel.value), current.getMonth(), 1);
    renderCalendar();
  });

  function renderCalendar() {
    const year = current.getFullYear();
    const month = current.getMonth();
    dpMonthSel.value = month;
    dpYearSel.value = year;

    const first = new Date(year, month, 1);
    const startDay = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysPrev = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const dayNum = i - startDay + 1;
      let date;
      let muted = false;
      if (dayNum < 1) {
        date = new Date(year, month - 1, daysPrev + dayNum);
        muted = true;
      } else if (dayNum > daysInMonth) {
        date = new Date(year, month + 1, dayNum - daysInMonth);
        muted = true;
      } else {
        date = new Date(year, month, dayNum);
      }
      const iso = formatIso(date);
      const selected = iso === selectedIso ? "selected" : "";
      const mutedClass = muted ? "muted" : "";
      const disabled = isDisabled(date) ? "disabled" : "";
      const disabledAttr = isDisabled(date) ? "disabled" : "";
      cells.push(
        `<button class="dp-day ${mutedClass} ${selected} ${disabled}" data-iso="${iso}" ${disabledAttr}>${date.getDate()}</button>`
      );
    }
    dpDays.innerHTML = cells.join("");
  }

  function openPicker(input) {
    activeInput = input;
    activeHidden = document.getElementById(
      input.getAttribute("data-date-input") + "Value"
    );
    activeMode = input.getAttribute("data-date-mode") || "future";

    const existing = activeHidden && activeHidden.value;
    if (existing) {
      const [y, m, d] = existing.split("-").map((n) => Number(n));
      current = new Date(y, m - 1, d);
      selectedIso = existing;
    } else {
      current = new Date();
      selectedIso = formatIso(current);
    }

    populateSelects();
    renderCalendar();

    const rect = input.getBoundingClientRect();
    picker.style.top = `${rect.bottom + window.scrollY + 8}px`;
    picker.style.left = `${Math.min(
      rect.left + window.scrollX,
      window.scrollX + window.innerWidth - 300
    )}px`;
    picker.classList.remove("hidden");
  }

  function closePicker() {
    picker.classList.add("hidden");
    activeInput = null;
    activeHidden = null;
  }

  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".dp-nav");
    if (btn) {
      const dir = Number(btn.getAttribute("data-dir"));
      current = new Date(current.getFullYear(), current.getMonth() + dir, 1);
      renderCalendar();
      return;
    }
    const day = e.target.closest(".dp-day");
    if (day) {
      if (day.hasAttribute("disabled")) return;
      const iso = day.getAttribute("data-iso");
      const [y, m, d] = iso.split("-").map((n) => Number(n));
      setSelected(new Date(y, m - 1, d));
      closePicker();
    }
  });

  document.addEventListener("click", (e) => {
    if (!picker.contains(e.target) && !e.target.matches("[data-date-input]")) {
      closePicker();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePicker();
  });

  document.querySelectorAll("[data-date-input]").forEach((input) => {
    input.addEventListener("click", () => openPicker(input));
  });

  window.addEventListener("resize", () => {
    if (activeInput) openPicker(activeInput);
  });

  datepickerApi = {
    refresh: () => {
      refreshWeekdays();
      if (!picker.classList.contains("hidden")) renderCalendar();
    }
  };
}

setupDatePicker();

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const popup = document.getElementById("leadPopup");
const closePopup = document.getElementById("closePopup");
const POPUP_KEY = "lead_popup_next";
const POPUP_DONE_KEY = "lead_submitted";
const POPUP_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 horas

function shouldShowPopup() {
  if (localStorage.getItem(POPUP_DONE_KEY)) return false;
  const next = Number(localStorage.getItem(POPUP_KEY) || "0");
  return Date.now() > next;
}

function markPopupSeen() {
  localStorage.setItem(POPUP_KEY, String(Date.now() + POPUP_COOLDOWN_MS));
}

function markLeadSubmitted() {
  localStorage.setItem(POPUP_DONE_KEY, "1");
  localStorage.removeItem(POPUP_KEY);
}

if (popup && shouldShowPopup()) {
  let popupShown = false;
  function showPopupOnce() {
    if (popupShown) return;
    popupShown = true;
    popup.classList.add("show");
    markPopupSeen();
    window.removeEventListener("scroll", onScroll);
  }
  function onScroll() {
    if (window.scrollY > 300) showPopupOnce();
  }
  window.addEventListener("scroll", onScroll);
  setTimeout(showPopupOnce, 12000);
}

closePopup?.addEventListener("click", () => {
  popup?.classList.remove("show");
});

popup?.addEventListener("click", (e) => {
  if (e.target === popup) {
    popup.classList.remove("show");
  }
});

// ── Autocomplete de población ──────────────────────────────────────────────
const POBLACIONES = [
  "Blanes","Lloret de Mar","Girona","Tordera","Malgrat de Mar",
  "Santa Susanna","Palafolls","Calella","Pineda de Mar","Hostalric",
  "Barcelona","Tossa de Mar","Sant Celoni","Arenys de Mar","Mataró",
  "Badalona","Granollers","Vic","Figueres","Olot"
];

const poblacionInput = document.getElementById("poblacionInput");
const poblacionSugg = document.getElementById("poblacionSuggestions");

if (poblacionInput && poblacionSugg) {
  poblacionInput.addEventListener("input", () => {
    const q = poblacionInput.value.trim().toLowerCase();
    if (q.length < 2) { poblacionSugg.style.display = "none"; return; }
    const matches = POBLACIONES.filter(p => p.toLowerCase().startsWith(q));
    if (!matches.length) { poblacionSugg.style.display = "none"; return; }
    poblacionSugg.innerHTML = matches.map(p =>
      `<div style="padding:8px 12px;cursor:pointer;font-size:0.9rem" class="sugg-item">${p}</div>`
    ).join("");
    poblacionSugg.style.display = "block";
    poblacionSugg.querySelectorAll(".sugg-item").forEach(item => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        poblacionInput.value = item.textContent;
        poblacionSugg.style.display = "none";
      });
    });
  });
  poblacionInput.addEventListener("blur", () => {
    setTimeout(() => { poblacionSugg.style.display = "none"; }, 150);
  });
  poblacionInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") poblacionSugg.style.display = "none";
  });
}

const leadForm = document.getElementById("leadForm");
const leadMsg = document.getElementById("leadMsg");

if (leadForm) leadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  leadMsg.textContent = "";
  const formData = new FormData(leadForm);
  const payload = Object.fromEntries(formData.entries());

  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.ok) {
    markLeadSubmitted();
    const t2 = i18n[currentLang] || i18n.es;
    leadMsg.textContent = `${t2.success_lead}${data.premio ? " — " + data.premio : ""}`;
    leadForm.reset();
    setTimeout(() => popup.classList.remove("show"), 2500);
  } else {
    const t2 = i18n[currentLang] || i18n.es;
    leadMsg.textContent = t2.err_generic;
  }
});

const reservaForm = document.getElementById("reservaForm");
const reservaMsg = document.getElementById("reservaMsg");

if (reservaForm) reservaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  reservaMsg.textContent = "";
  const formData = new FormData(reservaForm);
  const payload = Object.fromEntries(formData.entries());

  const t = i18n[currentLang] || i18n.es;
  if (!payload.local) {
    reservaMsg.textContent = t.err_select_local;
    return;
  }
  if (!payload.dia) {
    reservaMsg.textContent = t.err_select_date;
    return;
  }
  if (!payload.hora) {
    reservaMsg.textContent = t.err_select_time;
    return;
  }

  const res = await fetch("/api/reservas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.ok) {
    const successEl = document.getElementById("reservaSuccess");
    const successTitle = document.getElementById("reservaSuccessTitle");
    const successDetails = document.getElementById("reservaSuccessDetails");
    if (successEl) {
      if (successTitle) successTitle.textContent = t.success_reserva;
      if (successDetails) successDetails.textContent = `${payload.local} · ${payload.dia} ${t.reservation_at} ${payload.hora} · ${payload.personas} ${t.reservation_people_unit}`;
      reservaForm.classList.add("hidden");
      successEl.classList.remove("hidden");
      successEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setTimeout(() => {
        successEl.classList.add("hidden");
        reservaForm.classList.remove("hidden");
      }, 8000);
    }
    reservaForm.reset();
    document.getElementById("localGrid").querySelectorAll(".local-chip").forEach((b) => b.classList.remove("selected"));
    document.getElementById("localValue").value = "";
    document.getElementById("timePicker").querySelectorAll(".time-pill").forEach((b) => b.classList.remove("selected"));
    document.getElementById("horaValue").value = "";
    personasCount = 2; updateStepper();
  } else {
    reservaMsg.textContent = data.error || t.err_generic;
  }
});

const savedLang = localStorage.getItem(LANG_KEY) || "es";
setLang(savedLang);
loadContent();

document.getElementById("reservaSuccessBack")?.addEventListener("click", () => {
  document.getElementById("reservaSuccess").classList.add("hidden");
  document.getElementById("reservaForm").classList.remove("hidden");
});

document.getElementById("reopenLead")?.addEventListener("click", () => {
  document.getElementById("leadPopup").classList.add("show");
});

async function loadJobs() {
  const list = document.getElementById("jobsList");
  if (!list) return;
  const res = await fetch("/api/hr/jobs");
  const data = await res.json();
  if (!data.ok || data.data.length === 0) {
    list.innerHTML = `<div class="card">Pronto: nuevas vacantes.</div>`;
    return;
  }
  list.innerHTML = data.data
    .map(
      (j) => `
      <div class="card">
        <strong>${j.titulo}</strong><br />
        ${j.local} · ${j.tipo}<br />
        <span class="muted">${j.descripcion}</span>
      </div>
    `
    )
    .join("");
}

loadJobs();

async function loadReviews() {
  const container = document.getElementById("resenasList");
  if (!container) return;
  try {
    const res = await fetch("/api/reviews?limit=6&rating=4");
    const data = await res.json();
    if (!data.ok || !data.data.length) return;

    const stars = (n) => "⭐".repeat(Math.min(n, 5));
    const REVIEWS_KEY = "reviews_shown_idx";
    const REVIEWS_DATE_KEY = "reviews_shown_date";
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem(REVIEWS_DATE_KEY);
    let startIdx = parseInt(localStorage.getItem(REVIEWS_KEY) || "0");
    if (lastDate !== today) {
      startIdx = (startIdx + 3) % data.data.length;
      localStorage.setItem(REVIEWS_KEY, startIdx);
      localStorage.setItem(REVIEWS_DATE_KEY, today);
    }

    const visible = [];
    for (let i = 0; i < 3 && i < data.data.length; i++) {
      visible.push(data.data[(startIdx + i) % data.data.length]);
    }

    container.innerHTML = visible.map((r) => `
      <div class="card resena">
        <div style="font-size:0.85rem;margin-bottom:0.4rem">${stars(r.rating)}</div>
        <p>"${r.text}"</p>
        <strong>— ${r.author}${r.location_name ? `, ${r.location_name}` : ""}</strong>
      </div>`).join("");
  } catch {
    // mantiene las reseñas hardcodeadas si falla
  }
}

loadReviews();

const hrForm = document.getElementById("hrForm");
const hrMsg = document.getElementById("hrMsg");
if (hrForm) {
  hrForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hrMsg.textContent = "";
    const formData = new FormData(hrForm);
    const res = await fetch("/api/hr/applications", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    const thr = i18n[currentLang] || i18n.es;
    if (data.ok) {
      hrMsg.textContent = thr.success_hr;
      hrForm.reset();
    } else {
      hrMsg.textContent = thr.err_hr;
    }
  });
}

document.querySelectorAll(".lang button").forEach((btn) => {
  btn.addEventListener("click", () => setLang(btn.dataset.lang));
});

const navToggle = document.getElementById("navToggle");
const nav = document.querySelector(".nav");
if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  nav.querySelectorAll("a, button").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

window.addEventListener("load", () => {
  setTimeout(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, 0);
});

let editModeEnabled = false;

if (window.top !== window) {
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg) return;

    if (msg.type === "edit-mode") {
      editModeEnabled = !!msg.enabled;
      document.documentElement.classList.toggle("edit-mode", editModeEnabled);
      let styleEl = document.getElementById("__edit-styles");
      if (editModeEnabled) {
        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = "__edit-styles";
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
          [data-content-key], [data-edit-key], .gallery-edit-slot { cursor: pointer !important; }
          [data-content-key] { border-radius:3px; transition: outline 0.1s; }
          [data-content-key]:hover { outline: 2px dashed rgba(249,115,22,0.6); }
          section[data-edit-key]:hover { box-shadow: inset 0 0 0 2px rgba(249,115,22,0.5); }
          #siteLogo { cursor:pointer !important; }
          #siteLogo:hover { outline: 2px dashed #f97316; border-radius:4px; }
          .canvas-selected { outline: 2px solid #f97316 !important; border-radius:3px; box-shadow: 0 0 0 4px rgba(249,115,22,0.15) !important; }
          section.canvas-selected { outline: none !important; box-shadow: inset 0 0 0 3px #f97316, 0 0 0 5px rgba(249,115,22,0.15) !important; }
          #siteLogo.canvas-selected { outline: 2px solid #f97316 !important; border-radius:4px; box-shadow: 0 0 0 4px rgba(249,115,22,0.15) !important; }
          #leadPopup { display: none !important; }
          .wa-float { display: none !important; }
          #galeriaGrid { display:grid !important; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:0.6rem; overflow:visible !important; }
          .galeria-grid { overflow:visible !important; }
          .gallery-edit-slot:hover .gallery-edit-overlay { opacity:1; }
          .gallery-edit-slot.canvas-selected .gallery-edit-overlay { opacity:1; background:rgba(249,115,22,0.35) !important; }
        `;
        document.getElementById("leadPopup")?.classList.remove("show");
        renderGallery();
      } else {
        styleEl?.remove();
        document.querySelectorAll(".canvas-selected").forEach(el => el.classList.remove("canvas-selected"));
      }
    }

    if (msg.type === "set-lang") {
      setLang(msg.lang);
      // Rebroadcast selected element with new lang values
      setTimeout(() => {
        const sel = document.querySelector(".canvas-selected");
        if (!sel) return;
        const isGallery = sel.classList.contains("gallery-edit-slot");
        if (isGallery) return; // gallery re-selection not needed on lang change
        const key = sel.dataset.contentKey || sel.dataset.editKey;
        if (!key) return;
        const isImg = sel.dataset.editKey && !sel.dataset.contentKey;
        window.parent.postMessage({
          type: "canvas-select", key,
          elementType: isImg ? "image" : "text",
          value: isImg ? (sel.src || "") : sel.textContent.trim(),
          lang: msg.lang
        }, "*");
      }, 60);
    }

    if (msg.type === "canvas-update") {
      const el = document.querySelector(`[data-content-key="${msg.key}"]`);
      if (el) el.textContent = msg.value;
    }
  });

  document.addEventListener("click", (e) => {
    if (!editModeEnabled) return;
    const a = e.target.closest("a");
    if (a) e.preventDefault();
    document.addEventListener("submit", ev => ev.preventDefault(), { once: true });

    // Find the most specific selectable target
    const gallerySlot = e.target.closest(".gallery-edit-slot");
    const textEl = !gallerySlot && e.target.closest("[data-content-key]");
    const imgEl = !gallerySlot && !textEl && e.target.closest("[data-edit-key]");
    const logoEl = !gallerySlot && !textEl && !imgEl && e.target.id === "siteLogo" ? e.target : null;
    const target = gallerySlot || textEl || imgEl || logoEl;

    document.querySelectorAll(".canvas-selected").forEach(el => el.classList.remove("canvas-selected"));

    if (!target) {
      window.parent.postMessage({ type: "canvas-deselect" }, "*");
      return;
    }
    target.classList.add("canvas-selected");

    if (gallerySlot) {
      const raw = contentCache.gallery_images || "";
      const urls = raw.split("\n").map(s => s.trim()).filter(Boolean);
      const idx = gallerySlot.dataset.galleryIdx !== undefined ? parseInt(gallerySlot.dataset.galleryIdx) : -1;
      window.parent.postMessage({
        type: "canvas-select", key: "gallery_images",
        elementType: gallerySlot.dataset.galleryAdd ? "gallery-add" : "gallery-item",
        idx, urls, lang: currentLang
      }, "*");
      return;
    }

    const key = target.dataset.contentKey || target.dataset.editKey || (target.id === "siteLogo" ? "site_logo_url" : null);
    const isImg = (target.dataset.editKey && !target.dataset.contentKey) || target.id === "siteLogo";
    window.parent.postMessage({
      type: "canvas-select", key,
      elementType: isImg ? "image" : "text",
      value: isImg ? (target.src || "") : target.textContent.trim(),
      lang: currentLang
    }, "*");
  });

  document.addEventListener("submit", e => { if (editModeEnabled) e.preventDefault(); });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const targetId = link.getAttribute("href");
    if (!targetId || targetId === "#") return;
    const el = document.querySelector(targetId);
    if (!el) return;
    e.preventDefault();
    const offset = 70;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: "smooth" });
  });
});
