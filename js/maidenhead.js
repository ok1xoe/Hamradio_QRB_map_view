// js/maidenhead.js

// 1) Výpočet lokátoru z lon/lat
export function maidenheadField(lon, lat) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lonAdj = lon + 180;
    const latAdj = lat + 90;
    const fieldLon = Math.floor(lonAdj / 20);
    const fieldLat = Math.floor(latAdj / 10);
    return `${A[fieldLon]}${A[fieldLat]}`;
}

export function maidenheadSquare(lon, lat) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lonAdj = lon + 180;
    const latAdj = lat + 90;

    const fieldLon = Math.floor(lonAdj / 20);
    const fieldLat = Math.floor(latAdj / 10);
    const squareLon = Math.floor((lonAdj % 20) / 2);
    const squareLat = Math.floor((latAdj % 10) / 1);

    return `${A[fieldLon]}${A[fieldLat]}${squareLon}${squareLat}`;
}

export function maidenheadSubsquare(lon, lat) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const a = "abcdefghijklmnopqrstuvwxyz";
    const lonAdj = lon + 180;
    const latAdj = lat + 90;

    const fieldLon = Math.floor(lonAdj / 20);
    const fieldLat = Math.floor(latAdj / 10);

    const squareLon = Math.floor((lonAdj % 20) / 2);
    const squareLat = Math.floor((latAdj % 10) / 1);

    const lonIn2deg = (lonAdj % 2);
    const latIn1deg = (latAdj % 1);

    const subsLon = Math.floor(lonIn2deg / (1 / 12)); // 0..23
    const subsLat = Math.floor(latIn1deg / (1 / 24)); // 0..23

    return `${A[fieldLon]}${A[fieldLat]}${squareLon}${squareLat}${a[subsLon]}${a[subsLat]}`;
}

// 2) Převod lokátoru → bbox v WGS84
export function locatorToExtentWGS84(locatorRaw) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const a = "abcdefghijklmnopqrstuvwxyz";

    const loc = String(locatorRaw || "").trim();
    if (!loc) return null;

    const locU = loc.toUpperCase();
    const locL = loc.toLowerCase();

    if (!(loc.length === 2 || loc.length === 4 || loc.length === 6)) return null;

    const fLon = A.indexOf(locU[0]);
    const fLat = A.indexOf(locU[1]);
    if (fLon < 0 || fLat < 0) return null;

    const fieldLon0 = -180 + fLon * 20;
    const fieldLat0 = -90 + fLat * 10;

    if (loc.length === 2) return [fieldLon0, fieldLat0, fieldLon0 + 20, fieldLat0 + 10];

    const sLon = Number(locU[2]);
    const sLat = Number(locU[3]);
    if (!Number.isInteger(sLon) || sLon < 0 || sLon > 9) return null;
    if (!Number.isInteger(sLat) || sLat < 0 || sLat > 9) return null;

    const lon0 = fieldLon0 + sLon * 2;
    const lat0 = fieldLat0 + sLat * 1;

    if (loc.length === 4) return [lon0, lat0, lon0 + 2, lat0 + 1];

    const subLon = a.indexOf(locL[4]);
    const subLat = a.indexOf(locL[5]);
    if (subLon < 0 || subLon > 23) return null;
    if (subLat < 0 || subLat > 23) return null;

    const stepLon = 1 / 12;
    const stepLat = 1 / 24;

    const slon0 = lon0 + subLon * stepLon;
    const slat0 = lat0 + subLat * stepLat;

    return [slon0, slat0, slon0 + stepLon, slat0 + stepLat];
}

export function locatorToCenterLonLat(locatorRaw) {
    const ext = locatorToExtentWGS84(locatorRaw);
    if (!ext) return null;
    return [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
}

// 3) Vykreslení mřížky pro daný extent (v EPSG:3857) a úroveň
export function buildGrid(extent3857, level) {
    // Extent v EPSG:3857 -> WGS84
    const ll = ol.proj.toLonLat([extent3857[0], extent3857[1]]);
    const ur = ol.proj.toLonLat([extent3857[2], extent3857[3]]);

    let minLon = Math.min(ll[0], ur[0]);
    let maxLon = Math.max(ll[0], ur[0]);
    let minLat = Math.min(ll[1], ur[1]);
    let maxLat = Math.max(ll[1], ur[1]);

    // Pokud jsme prakticky na celém světě, vezmeme celý svět
    if ((maxLon - minLon) > 300) {
        minLon = -180;
        maxLon = 180;
    }

    // Epsilon, aby nevznikalo políčko přesně na 180°
    const EPS = 1e-9;
    minLon = Math.max(-180, minLon);
    maxLon = Math.min(180 - EPS, maxLon);
    minLat = Math.max(-90, minLat);
    maxLat = Math.min(90 - EPS, maxLat);

    // Kroky a funkce pro popisek
    let stepLon, stepLat, labelFn;
    if (level === "subsquare") {
        stepLon = 1 / 12;
        stepLat = 1 / 24;
        labelFn = maidenheadSubsquare;
    } else if (level === "field") {
        stepLon = 20;
        stepLat = 10;
        labelFn = maidenheadField;
    } else { // square
        stepLon = 2;
        stepLat = 1;
        labelFn = maidenheadSquare;
    }

    const startLon = Math.floor((minLon + 180) / stepLon) * stepLon - 180;
    const endLon   = Math.ceil((maxLon + 180) / stepLon) * stepLon - 180;
    const startLat = Math.floor((minLat + 90) / stepLat) * stepLat - 90;
    const endLat   = Math.ceil((maxLat + 90) / stepLat) * stepLat - 90;

    const features = [];

    for (let lon = startLon; lon < endLon; lon += stepLon) {
        if (lon >= 180) continue; // jistota
        for (let lat = startLat; lat < endLat; lat += stepLat) {
            if (lat >= 90) continue;

            const lon2 = Math.min(lon + stepLon, 180 - EPS);
            const lat2 = Math.min(lat + stepLat, 90 - EPS);

            const ring = [
                [lon,  lat],
                [lon2, lat],
                [lon2, lat2],
                [lon,  lat2],
                [lon,  lat]
            ].map(c => ol.proj.fromLonLat(c));

            const polygon = new ol.geom.Polygon([ring]);

            const centerLon = (lon + lon2) / 2;
            const centerLat = (lat + lat2) / 2;

            features.push(new ol.Feature({
                geometry: polygon,
                label: labelFn(centerLon, centerLat)
            }));
        }
    }

    return features;
}