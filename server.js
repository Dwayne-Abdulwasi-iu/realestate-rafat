const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const { default: MongoStore } = require('connect-mongo');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const ADMIN_EMAIL = 'realestate@gmail.com';
const ADMIN_PASSWORD = 'realestate';

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PROPS_FILE = path.join(DATA_DIR, 'properties.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const TRASH_FILE = path.join(DATA_DIR, 'trash.json');
const UPLOADS_TRASH = path.join(UPLOAD_DIR, 'trash');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://lytleewayne:Abdulwasiu@cluster0.as7yeiu.mongodb.net/?appName=Cluster0';
const MONGO_DB = process.env.MONGODB_DB || 'realestate';
let db = null;
let propertiesCollection = null;
let reviewsCollection = null;
const mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(UPLOADS_TRASH)) fs.mkdirSync(UPLOADS_TRASH, { recursive: true });
if (!fs.existsSync(TRASH_FILE)) writeJSON(TRASH_FILE, []);

function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || 'null') || fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function connectMongo() {
  try {
    await mongoClient.connect();
    db = mongoClient.db(MONGO_DB);
    propertiesCollection = db.collection('properties');
    reviewsCollection = db.collection('reviews');
    console.log('Connected to MongoDB:', MONGO_URI, 'db=', MONGO_DB);
    await ensureMongoSeed();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message || err);
  }
}

async function ensureMongoSeed() {
  if (!propertiesCollection || !reviewsCollection) return;

  try {
    const propsCount = await propertiesCollection.countDocuments();
    if (propsCount === 0) {
      const props = readJSON(PROPS_FILE, []);
      if (props.length) {
        await propertiesCollection.insertMany(props.map((p) => ({ ...p, createdAt: p.createdAt ? new Date(p.createdAt) : new Date() })));
      }
    }

    const reviewsCount = await reviewsCollection.countDocuments();
    if (reviewsCount === 0) {
      const reviews = readJSON(REVIEWS_FILE, []);
      if (reviews.length) {
        await reviewsCollection.insertMany(reviews.map((r) => ({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() })));
      }
    }
  } catch (err) {
    console.error('MongoDB seeding failed:', err.message || err);
  }
}

async function getProperties() {
  if (propertiesCollection) {
    return propertiesCollection.find().sort({ createdAt: -1 }).toArray();
  }
  return readJSON(PROPS_FILE, []);
}

async function saveProperties(props) {
  if (propertiesCollection) {
    await propertiesCollection.deleteMany({});
    if (props.length) {
      const docs = props.map((p) => ({ ...p, createdAt: p.createdAt ? new Date(p.createdAt) : new Date() }));
      await propertiesCollection.insertMany(docs);
    }
    return props;
  }
  writeJSON(PROPS_FILE, props);
  return props;
}

async function getReviews() {
  if (reviewsCollection) {
    return reviewsCollection.find().sort({ createdAt: -1 }).toArray();
  }
  return readJSON(REVIEWS_FILE, []);
}

async function saveReviews(reviews) {
  if (reviewsCollection) {
    await reviewsCollection.deleteMany({});
    if (reviews.length) {
      const docs = reviews.map((r) => ({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() }));
      await reviewsCollection.insertMany(docs);
    }
    return reviews;
  }
  writeJSON(REVIEWS_FILE, reviews);
  return reviews;
}

// Initialize with sample data if missing
if (!fs.existsSync(PROPS_FILE)) {
  writeJSON(PROPS_FILE, [
    {
      id: uuidv4(),
      title: 'Luxury Apartment with Ocean View',
      media: [],
      type: 'Apartment',
      status: 'For Sale',
      description: 'A contemporary apartment with smart home features, premium finishes, and a beautiful balcony view.',
      location: 'Victoria Island',
      price: 420000000,
      bedrooms: 3,
      bathrooms: 3,
      size: 2800,
      contact: 'Call RealtorRafat for private viewing'
    }
  ]);
}

if (!fs.existsSync(REVIEWS_FILE)) {
  writeJSON(REVIEWS_FILE, [
    {
      id: uuidv4(),
      name: 'Ada Okafor',
      email: 'ada@example.com',
      rating: 5,
      comment: 'The process was smooth and professional. I found the right apartment quickly.'
    }
  ]);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'real-estate-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGO_URI,
    dbName: MONGO_DB,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60
  })
}));

app.use((req, res, next) => {
  const allowedOrigins = [
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'https://realestate-rafat.onrender.com',
    'https://www.realestate-rafat.onrender.com'
  ];
  const origin = req.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// serve uploads and static site
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname)));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random()*1e9)}-${file.originalname.replace(/\s+/g,'_')}`;
    cb(null, unique);
  }
});
const upload = multer({ storage });

function ensureAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// API endpoints
app.get('/api/properties', async (req, res) => {
  const props = await getProperties();
  res.json(props);
});

// Server-side search with optional price range and pagination
// Example: /api/properties/search?q=apartment&min=1000000&max=5000000&page=1&limit=20
app.get('/api/properties/search', async (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase().trim();
  const min = req.query.min ? Number(req.query.min) : null;
  const max = req.query.max ? Number(req.query.max) : null;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.max(1, parseInt(req.query.limit || '20', 10));

  const props = await getProperties();

  function matches(p) {
    if (q) {
      const hay = [p.title, p.location, p.type, p.status, p.description, p.contact].map(v => (v || '').toString().toLowerCase());
      if (hay.some(h => h.includes(q))) return true;
      if (Array.isArray(p.media)) {
        for (const m of p.media) {
          if ((m.name || '').toString().toLowerCase().includes(q)) return true;
          if ((m.url || '').toString().toLowerCase().includes(q)) return true;
        }
      }
      return false;
    }
    return true;
  }

  let results = props.filter(p => matches(p));

  if (min !== null || max !== null) {
    results = results.filter((p) => {
      const price = Number(p.price || 0);
      if (min !== null && price < min) return false;
      if (max !== null && price > max) return false;
      return true;
    });
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pageResults = results.slice(start, start + limit);

  res.json({ results: pageResults, total, page, limit, totalPages });
});

app.post('/api/properties', ensureAuth, upload.array('media'), async (req, res) => {
  const props = await getProperties();
  const id = uuidv4();
  const fields = req.body;
  const media = (req.files || []).map((f) => ({ name: f.originalname, type: f.mimetype.startsWith('video') ? 'video' : 'image', url: `/uploads/${f.filename}` }));
  const property = {
    id,
    title: fields.title || '',
    type: fields.type || '',
    status: fields.status || '',
    description: fields.description || '',
    location: fields.location || '',
    price: Number(fields.price || 0),
    bedrooms: Number(fields.bedrooms || 0),
    bathrooms: Number(fields.bathrooms || 0),
    size: Number(fields.size || 0),
    contact: fields.contact || '',
    media
  };
  props.unshift(property);
  await saveProperties(props);
  res.json(property);
});

app.put('/api/properties/:id', ensureAuth, upload.array('media'), async (req, res) => {
  const id = req.params.id;
  const props = await getProperties();
  const index = props.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  const fields = req.body;
  const existing = props[index];
  const newMedia = (req.files || []).map((f) => ({ name: f.originalname, type: f.mimetype.startsWith('video') ? 'video' : 'image', url: `/uploads/${f.filename}` }));
  const updated = Object.assign({}, existing, {
    title: fields.title || existing.title,
    type: fields.type || existing.type,
    status: fields.status || existing.status,
    description: fields.description || existing.description,
    location: fields.location || existing.location,
    price: Number(fields.price || existing.price),
    bedrooms: Number(fields.bedrooms || existing.bedrooms),
    bathrooms: Number(fields.bathrooms || existing.bathrooms),
    size: Number(fields.size || existing.size),
    contact: fields.contact || existing.contact,
    media: [...newMedia, ...(existing.media || [])]
  });
  props[index] = updated;
  await saveProperties(props);
  res.json(updated);
});

// Soft-delete a single media item for a property (move to trash)
app.delete('/api/properties/:id/media', ensureAuth, async (req, res) => {
  const id = req.params.id;
  const { mediaUrl } = req.body || {};
  if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl required' });
  const props = await getProperties();
  const index = props.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: 'Property not found' });
  const mediaArr = props[index].media || [];
  const mIndex = mediaArr.findIndex(m => m.url === mediaUrl || m.name === mediaUrl || (m.url && m.url.endsWith(mediaUrl)));
  if (mIndex === -1) return res.status(404).json({ error: 'Media not found' });
  const [removed] = mediaArr.splice(mIndex,1);
  // move file to trash instead of deleting permanently
  let movedFilename = null;
  try {
    if (removed && removed.url) {
      const origPath = path.join(__dirname, removed.url.replace(/^\//,''));
      if (fs.existsSync(origPath)) {
        movedFilename = `${Date.now()}-${Math.round(Math.random()*1e9)}-${path.basename(origPath)}`;
        const dest = path.join(UPLOADS_TRASH, movedFilename);
        fs.renameSync(origPath, dest);
      }
    }
  } catch(e) { console.error('move to trash failed', e); }

  props[index].media = mediaArr;
  await saveProperties(props);

  const trash = readJSON(TRASH_FILE, []);
  const trashId = uuidv4();
  trash.push({ trashId, propertyId: id, media: removed, originalIndex: mIndex, movedFilename, removedAt: Date.now() });
  writeJSON(TRASH_FILE, trash);
  res.json({ success: true, trashId });
});

// Restore a media item from trash back to a property
app.post('/api/properties/:id/media/restore', ensureAuth, async (req, res) => {
  const id = req.params.id;
  const { trashId } = req.body || {};
  if (!trashId) return res.status(400).json({ error: 'trashId required' });
  const trash = readJSON(TRASH_FILE, []);
  const tIndex = trash.findIndex(t => t.trashId === trashId && t.propertyId === id);
  if (tIndex === -1) return res.status(404).json({ error: 'Trash item not found' });
  const record = trash[tIndex];
  const props = await getProperties();
  const pIndex = props.findIndex(p => p.id === id);
  if (pIndex === -1) return res.status(404).json({ error: 'Property not found' });
  // move file back
  try {
    if (record.movedFilename) {
      const src = path.join(UPLOADS_TRASH, record.movedFilename);
      const destFile = record.movedFilename; // keep same name in uploads
      const dest = path.join(UPLOAD_DIR, destFile);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        // update media url to new location
        record.media.url = `/uploads/${destFile}`;
      }
    }
  } catch(e) { console.error('restore move failed', e); }

  // reinsert into property's media
  const insertIndex = typeof record.originalIndex === 'number' ? record.originalIndex : 0;
  props[pIndex].media = props[pIndex].media || [];
  props[pIndex].media.splice(insertIndex, 0, record.media);
  await saveProperties(props);

  // remove from trash list
  trash.splice(tIndex,1);
  writeJSON(TRASH_FILE, trash);

  res.json({ success: true, property: props[pIndex] });
});

// Delete a single media item for a property
app.delete('/api/properties/:id/media/delete', ensureAuth, async (req, res) => {
  const id = req.params.id;
  const { mediaUrl } = req.body || {};
  if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl required' });
  const props = await getProperties();
  const index = props.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: 'Property not found' });
  const mediaArr = props[index].media || [];
  const mIndex = mediaArr.findIndex(m => m.url === mediaUrl || m.name === mediaUrl || (m.url && m.url.endsWith(mediaUrl)));
  if (mIndex === -1) return res.status(404).json({ error: 'Media not found' });
  const [removed] = mediaArr.splice(mIndex,1);
  // try to delete file
  try {
    if (removed && removed.url) {
      const fpath = path.join(__dirname, removed.url.replace(/^\//,''));
      if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    }
  } catch(e){}
  props[index].media = mediaArr;
  await saveProperties(props);
  res.json({ success: true });
});

app.delete('/api/properties/:id', ensureAuth, async (req, res) => {
  const id = req.params.id;
  const props = await getProperties();
  const index = props.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  const [removed] = props.splice(index,1);
  // delete files referenced
  (removed.media || []).forEach(m => {
    try {
      const fpath = path.join(__dirname, m.url.replace(/^\//,''));
      if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    } catch(e){}
  });
  await saveProperties(props);
  res.json({ success: true });
});

app.get('/api/reviews', async (req, res) => {
  const reviews = await getReviews();
  res.json(reviews);
});

app.post('/api/reviews', async (req, res) => {
  const reviews = await getReviews();
  const r = {
    id: uuidv4(),
    name: req.body.name || '',
    email: req.body.email || '',
    rating: Number(req.body.rating || 5),
    comment: req.body.comment || ''
  };
  reviews.unshift(r);
  await saveReviews(reviews);
  res.json(r);
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

async function startServer() {
  await connectMongo();
  app.listen(PORT, () => console.log(`Server listening on http://127.0.0.1:${PORT}`));
}

startServer();
