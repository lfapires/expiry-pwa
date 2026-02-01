const DB_NAME = "expiry-db";
const DB_VER = 1;
const STORE = "products";

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      const os = db.createObjectStore(STORE, { keyPath: "id" });
      os.createIndex("category", "category");
      os.createIndex("updatedAt", "updatedAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode="readonly"){
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function listProducts(){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const os = tx(db);
    const req = os.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getProduct(id){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const os = tx(db);
    const req = os.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertProduct(p){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const os = tx(db, "readwrite");
    const req = os.put(p);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProduct(id){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const os = tx(db, "readwrite");
    const req = os.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
