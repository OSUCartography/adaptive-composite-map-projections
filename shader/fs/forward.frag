#ifdef GL_ES
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#endif

#define EPS 1e-7

#define PI 3.14159265358979323846
#define HALFPI (3.14159265358979323846 / 2.)
#define M_1_PI 0.31830988618379067154
#define WEB_MERCATOR_MAX_LAT 1.4844222297453322

#define EPSG_MERCATOR 3857.
#define EPSG_ROBINSON 54030.
#define EPSG_GEOGRAPHIC 4979.
#define EPSG_SINUSOIDAL 54008.
#define EPSG_LAMBERT_CYLINDRICAL_TRANSVERSE -9834.

#define ALBERS_ID 11.
#define LAMBERT_AZIMUTHAL_NORTH_POLAR_ID -2.
#define LAMBERT_AZIMUTHAL_SOUTH_POLAR_ID -3.
#define TRANSFORMED_WAGNER_ID 654267985.
#define NATURAL_EARTH_ID 7259365.
#define CANTERS1_ID 53287562.
#define CANTERS2_ID 38426587.
#define CYLINDRICAL_EQUAL_AREA_ID -1.
#define MIXPROJECTION -9999.0

// FIXME should be int
uniform float projectionID;

// projections to mix and weight for the mix
// FIXME should be int
uniform float mix1ProjectionID;
// FIXME should be int
uniform float mix2ProjectionID;
uniform float mixWeight;

uniform sampler2D texture;
varying vec2 textureCoord;
varying float alongAntimeridian;

uniform vec2 scaleXY;
uniform vec2 dXY;

// vertical shift
uniform float falseNorthing;

// vertical shift for the second projection in a mix
uniform float falseNorthing2;

// spherical rotation
uniform float sinLatPole;
uniform float cosLatPole;

// central meridian
uniform float meridian;

// parameters for transformed Lambert azimuthal
uniform float wagnerM;
uniform float wagnerN;
uniform float wagnerCA;
uniform float wagnerCB;

// parameters for Albers conic
uniform float albersC;
uniform float albersRho0;
uniform float albersN;


vec2 transformSphere(in vec2 lonLat) {
    vec2 sinLonLat = sin(lonLat);
    vec2 cosLonLat = cos(lonLat);
    float sinLon = sinLonLat.x;
    float cosLon = cosLonLat.x;
    float sinLat = sinLonLat.y;
    float cosLat = cosLonLat.y;
    float cosLat_x_cosLon = cosLat * cosLon;
    
    // FIXME normalize ?
    float lon = /*normalizeLam(*/atan(cosLat * sinLon, sinLatPole * cosLat_x_cosLon + cosLatPole * sinLat)/*)*/;
    float lat = asin(sinLatPole * sinLat - cosLatPole * cosLat_x_cosLon);
    return vec2(lon, lat);
}

// A polynomial version of the Robinson projection.
// Canters, F., Decleir, H. 1989. The world in perspective – A directory of
// world map projections. Chichester, John Wiley and Sons: p. 143.
vec2 robinson(in vec2 lonLat) {
    //float x = lon * (0.8507 - lat2 * (0.1450 + lat2 * 0.0104));
    //float y = lat * (0.9642 - lat2 * (0.0013 + lat2 * 0.0129));
    
    vec2 lat2 = vec2(lonLat.y * lonLat.y);
    vec2 xy = lat2 * vec2(0.0104, 0.0129);
    xy += vec2(0.1450, 0.0013);
    xy *= -lat2;
    xy += vec2(0.8507, 0.9642);
    xy *= lonLat;
    return xy;
}

// B. Savric et al., A polynomial equation for the Natural Earth projection,
// in: Cartography and Geographic Information Science, 38-4, pp. 363–372, 2011.
vec2 naturalEarth(in vec2 lonLat) {
    float lon = lonLat.x;
    float lat = lonLat.y;
    float lat2 = lat * lat;
    float lat4 = lat2 * lat2;
    float x = lon * (0.8707 - 0.131979 * lat2 + lat4 * (-0.013791 + lat4 * (0.003971 * lat2 - 0.001529 * lat4)));
    float y = lat * (1.007226 + lat2 * (0.015085 + lat4 * (-0.044475 + 0.028874 * lat2 - 0.005916 * lat4)));
    return vec2(x, y);
}

vec2 sinusoidal(in vec2 lonLat) {
    return vec2(lonLat.x * cos(lonLat.y), lonLat.y);
}

// Canters, F. (2002) Small-scale Map projection Design. p. 218-219.
// Modified Sinusoidal, equal-area.
vec2 canters1(in vec2 lonLat) {
    const float C1 = 1.1966;
    const float C3 = -0.1290;
    const float C3x3 = 3. * C3;
    const float C5 = -0.0076;
    const float C5x5 = 5. * C5;
    float lat = lonLat.y;
    vec2 y2 = vec2(lat * lat);
    //x = lon * cos(lat) / (C1 + C3x3 * lat^2 + C5x5 * lat^4);
    //y = lat * (C1 + C3 * lat^2 + C5 * lat^4);
    vec2 k = vec2(C1) + y2 * (vec2(C3x3, C3) + vec2(C5x5, C5) * y2);
    return lonLat * vec2(cos(lat) / k.x, k.y);
}

// Canters, F. (2002) Small-scale Map projection Design. p. 218-220.
// Modified Sinusoidal, equal-area.
vec2 canters2(in vec2 lonLat) {
    const float C1 = 1.1481;
    const float C3 = -0.0753;
    const float C3x3 = 3. * C3;
    const float C5 = -0.0150;
    const float C5x5 = 5. * C5;
    float lat = lonLat.y;
    vec2 y2 = vec2(lat * lat);
    //x = lon * cos(lat) / (C1 + C3x3 * lat^2 + C5x5 * lat^4);
    //y = lat * (C1 + C3 * lat^2 + C5 * lat^4);
    vec2 k = vec2(C1) + y2 * (vec2(C3x3, C3) + vec2(C5x5, C5) * y2);
    return lonLat * vec2(cos(lat) / k.x, k.y);
}

vec2 cylindricalEqualArea(in vec2 lonLat) {
    return vec2(lonLat.x, sin(lonLat.y));
}

vec2 transformedWagner(in vec2 lonLat) {
    lonLat.x *= wagnerN;
    vec2 sinLonLat = sin(lonLat);
    float sinLon = sinLonLat.x;
    float sinLat = sinLonLat.y;
    float cosLon = cos(lonLat.x);
    
    float sinO = wagnerM * sinLat;
    float cosO = sqrt(1. - sinO * sinO);
    float d = sqrt(2. / (1. + cosO * cosLon));
    float x = wagnerCA * d * cosO * sinLon;
    float y = wagnerCB * d * sinO;
    return vec2(x, y);
}

vec2 albersConic(in vec2 lonLat) {
    float lon = lonLat.x;
    float lat = lonLat.y;
    float rho = albersC - 2. * albersN * sin(lat);
    rho = sqrt(rho) / albersN;
    float n_x_lon = albersN * lon;
    float x = rho * sin(n_x_lon);
    float y = albersRho0 - rho * cos(n_x_lon);
    return vec2(x, y);
}

vec2 lambertAzimuthalNorthPolar(in vec2 lonLat) {
    float lon = lonLat.x;
    float lat = lonLat.y;
    float k = 2. * sin(PI / 4. - lat / 2.);
    return k * vec2(sin(lon), -cos(lon));
}

vec2 lambertAzimuthalSouthPolar(in vec2 lonLat) {
    float lon = lonLat.x;
    float lat = lonLat.y;
    float k = 2. * cos(PI / 4. - lat / 2.);
    return k * vec2(sin(lon), cos(lon));
}

vec2 mercator(in vec2 lonLat) {
    float lon = lonLat.x;
    float lat = lonLat.y;
    lat = clamp(lat, -WEB_MERCATOR_MAX_LAT, WEB_MERCATOR_MAX_LAT);
    float y = log(tan(0.5 * (PI / 2. + lat)));
    return vec2(lon, y);
}

vec2 lambertCylindricalTransverse(in vec2 lonLat) {
    float lon = lonLat.x;
    float lat = lonLat.y;
    
    // FIXME
    float k0 = 1.;
    float lat0 = 0.;
    
    float x = cos(lat) * sin(lon) / k0;
    float y = k0 * (atan(tan(lat), cos(lon)) - lat0);
    return vec2(x, y);
}

vec2 project(in vec2 lonLat, in float projectionID) {
    // world map projections
    if (projectionID == TRANSFORMED_WAGNER_ID) {
        return transformedWagner(lonLat);
    } else if (projectionID == EPSG_ROBINSON) {
        return robinson(lonLat);
    } else if (projectionID == NATURAL_EARTH_ID) {
        return naturalEarth(lonLat);
    } else if (projectionID == EPSG_GEOGRAPHIC) {
        return lonLat;
    } else if (projectionID == EPSG_SINUSOIDAL) {
        return sinusoidal(lonLat);
    } else if (projectionID == CANTERS1_ID) {
        return canters1(lonLat);
    } else if (projectionID == CANTERS2_ID) {
        return canters2(lonLat);
    } else if (projectionID == CYLINDRICAL_EQUAL_AREA_ID) {
        return cylindricalEqualArea(lonLat);
    }
    // continental and regional scale projections
    else if (projectionID == ALBERS_ID) {
        return albersConic(lonLat);
    } else if (projectionID == LAMBERT_AZIMUTHAL_NORTH_POLAR_ID) {
        return lambertAzimuthalNorthPolar(lonLat);
    } else if (projectionID == LAMBERT_AZIMUTHAL_SOUTH_POLAR_ID) {
        return lambertAzimuthalSouthPolar(lonLat);
    } else if (projectionID == EPSG_MERCATOR) {
        return mercator(lonLat);
    } else {//if (projectionID == EPSG_LAMBERT_CYLINDRICAL_TRANSVERSE) {
        return lambertCylindricalTransverse(lonLat);
    }
}

vec2 projectionMix(in vec2 lonLat) {
    vec2 xy1 = project(lonLat, mix1ProjectionID);
    xy1.y += falseNorthing;
    vec2 xy2 = project(lonLat, mix2ProjectionID);
    xy2.y += falseNorthing2;
    return mix(xy2, xy1, mixWeight);
}

vec2 invGeographic(in vec2 xy) {
    if (any(greaterThan(abs(xy), vec2(PI, HALFPI)))) {
        discard;
    }
    return xy;
}

vec2 invSinusoidal(in vec2 xy) {
    vec2 lonLat = vec2(xy.x / cos(xy.y), xy.y);
    if (any(greaterThan(abs(xy), vec2(PI, HALFPI)))) {
        discard;
    }
    return lonLat;
}

// Canters, F. (2002) Small-scale Map projection Design. p. 218-219.
// Modified Sinusoidal, equal-area.
vec2 invCanters1(in vec2 xy) {
    const int MAX_ITERATIONS = 20;
    vec2 dxy;
    vec2 lonLat = vec2(0);
    for (int i = 0; i < MAX_ITERATIONS; i++) {
        // difference in projected coordinates
        dxy = xy - canters1(lonLat).xy;
        // add half of the horizontal and vertical difference to the longitude and the latitude
        lonLat += dxy * 0.5;
        // to guarantee stable forward projection, latitude must not go beyond +/-PI/2
        clamp(lonLat, vec2(-PI, -HALFPI), vec2(PI, HALFPI));
        // stop when difference is small enough
        if (all(lessThan(abs(dxy), vec2(EPS)))) {
            break;
        }
    }
    return lonLat;
}

// Canters, F. (2002) Small-scale Map projection Design. p. 218-219.
// Modified Sinusoidal, equal-area.
vec2 invCanters2(in vec2 xy) {
    const int MAX_ITERATIONS = 20;
    vec2 dxy;
    vec2 lonLat = vec2(0);
    for (int i = 0; i < MAX_ITERATIONS; i++) {
        // difference in projected coordinates
        dxy = xy - canters2(lonLat).xy;
        // add half of the horizontal and vertical difference to the longitude and the latitude
        lonLat += dxy * 0.5;
        // to guarantee stable forward projection, latitude must not go beyond +/-PI/2
        clamp(lonLat, vec2(-PI, -HALFPI), vec2(PI, HALFPI));
        // stop when difference is small enough
        if (all(lessThan(abs(dxy), vec2(EPS)))) {
            break;
        }
    }
    return lonLat;
}

vec2 invTransformedWagner(in vec2 xy) {
    // FIXME uniforms wagnerCA and wagnerCB should be vec2
    xy /= vec2(wagnerCA, wagnerCB);
    
    float l = dot(xy, xy); // x * x + y * y
    if (l > 4.) {
        discard;
    }
    // if x * x + y * y equals 4, the point is on the bounding circle of the
    // Lambert azimuthal (the limiting case). This should never happen, as
    // inverseLambertAzimuthal() should be used in this case . If it does happen,
    // z is NaN and the following computations will return NaN coordinates.
    float z = sqrt(1. - 0.25 * l);
    float sinLat = z * xy.y / wagnerM;
    if (sinLat < -1. || sinLat > 1.) {
        discard;
    }
    float zz2_1 = 2. * z * z - 1.;
    xy *= z;
    float lon = atan(xy.x, zz2_1) / wagnerN;
    if (lon > PI || lon < -PI) {
        discard;
    }
    
    float lat = asin(xy.y / wagnerM);
    return vec2 (lon, lat);
}

vec2 invNaturalEarth(in vec2 xy){
    const float MAX_Y = 0.8707 * 0.52 * PI;
    const int MAX_ITERATIONS = 20;
    float yc, tol, y2, y4, f, fder, lon;
    
    if (xy.y > MAX_Y || xy.y < -MAX_Y) {
        discard;
    }
    
    // Newton's method for the latitude
    yc = xy.y;
    for (int i = 0; i < MAX_ITERATIONS; i++) {
        y2 = yc * yc;
        y4 = y2 * y2;
        f = (yc * (1.007226 + y2 * (0.015085 + y4 * (-0.044475 + 0.028874 * y2 - 0.005916 * y4)))) - xy.y;
        fder = 1.007226 + y2 * (0.015085 * 3. + y4 * (-0.044475 * 7. + 0.028874 * 9. * y2 - 0.005916 * 11. * y4));
        yc -= tol = f / fder;
        if (abs(tol) < EPS) {
            break;
        }
    }
    
    // longitude
    y2 = yc * yc;
    lon = xy.x / (0.8707 + y2 * (-0.131979 + y2 * (-0.013791 + y2 * y2 * y2 * (0.003971 - 0.001529 * y2))));
    if (lon > PI || lon < -PI) {
        discard;
    }
    return vec2(lon, yc);
}

vec2 invRobinson(in vec2 xy){
    
    const float MAX_Y = 1.38615911291;
    const int MAX_ITERATIONS = 20;
    float yc, tol, y2, y4, f, fder, lon;
    
    if (xy.y > MAX_Y || xy.y < -MAX_Y) {
        discard;
    }
    
    // compute latitude with Newton's method
    yc = xy.y;
    for (int i = 0; i < MAX_ITERATIONS; i++) {
        y2 = yc * yc;
        f = (yc * (0.9642 - y2 * (0.0013 + y2 * 0.0129))) - xy.y;
        fder = 0.9642 - y2 * (0.0013 * 3. + y2 * 0.0129 * 5.);
        yc -= tol = f / fder;
        if (abs(tol) < EPS) {
            break;
        }
    }
    
    // longitude
    y2 = yc * yc;
    lon = xy.x / (0.8507 - y2 * (0.1450 + y2 * 0.0104));
    if (lon > PI || lon < -PI) {
        discard;
    }
    return vec2(lon, yc);
}

vec2 invLambertAzimuthalNorthPolar(in vec2 xy) {
    float d = length(xy);
    if (d > 2.) {
        discard;
    }
    float lon = atan(xy.x, -xy.y);
    float lat = - 2. * asin(d / 2.) + PI / 2.;
    return vec2 (lon, lat);
}

vec2 invLambertAzimuthalSouthPolar(in vec2 xy) {
    float d = length(xy);
    if (d > 2.) {
        discard;
    }
    float lon = atan(xy.x, xy.y);
    float lat = 2. * asin(d / 2.) - PI / 2.;
    return vec2 (lon, lat);
}

vec2 invAlbersConic(in vec2 xy) {
    xy.y = albersRho0 - xy.y;
    float rho = length(xy);
    if (rho == 0.) {
        return vec2(0., albersN > 0. ? PI / 2. : -PI / 2.);
    }
    float lon, lat;
    float phi = rho * albersN;
    phi = (albersC - phi * phi) / (albersN * 2.);
    if (abs(phi) > 1.) {
        discard;
    }
    lat = asin(phi);
    
    if (albersN < 0.) {
        lon = atan(-xy.x, -xy.y) / albersN;
    } else {
        lon = atan(xy.x, xy.y) / albersN;
    }
    if (lon > PI || lon < -PI) {
        discard;
    }
    return vec2(lon, lat);
}

vec2 invCylindricalEqualArea(in vec2 xy) {
    if (any(greaterThan(abs(xy), vec2(PI, HALFPI)))) {
        discard;
    }
    return vec2(xy.x, asin(xy.y));
}

vec2 invMercator(in vec2 xy) {
    if (xy.x > PI || xy.x < -PI) {
        discard;
    }
    return vec2(xy.x, HALFPI - 2. * atan(exp(-xy.y)));
}

vec2 invProjection(in vec2 xy, in float projectionID) {
    
    // world map projections
    if (projectionID == TRANSFORMED_WAGNER_ID) {
        return invTransformedWagner(xy);
    }
    else if (projectionID == EPSG_ROBINSON) {
        return invRobinson(xy);
    }
    else if (projectionID == NATURAL_EARTH_ID) {
        return invNaturalEarth(xy);
    }
    else if (projectionID == EPSG_GEOGRAPHIC) {
        return invGeographic(xy);
    }
    else if (projectionID == EPSG_SINUSOIDAL) {
        return invSinusoidal(xy);
    }
    else if (projectionID == CANTERS1_ID) {
        return invCanters1(xy);
    }
    else if (projectionID == CANTERS2_ID) {
        return invCanters2(xy);
    }
    else if (projectionID == CYLINDRICAL_EQUAL_AREA_ID) {
        return invCylindricalEqualArea(xy);
    }
    
    // continental and regional scale projections
    else if (projectionID == ALBERS_ID) {
        return invAlbersConic(xy);
    }
    else if (projectionID == LAMBERT_AZIMUTHAL_NORTH_POLAR_ID) {
        return invLambertAzimuthalNorthPolar(xy);
    }
    else if (projectionID == LAMBERT_AZIMUTHAL_SOUTH_POLAR_ID) {
        return invLambertAzimuthalSouthPolar(xy);
    } else { // if (projectionID == EPSG_MERCATOR) {
        return invMercator(xy);
    }
    /* FIXME
     if (projectionID == EPSG_LAMBERT_CYLINDRICAL_TRANSVERSE) {
     return lambertCylindricalTransverse(lon, lat);
     }
     */
}

vec2 invProjectionMix(in vec2 xy) {
    
    // maximum number of loops
    const int MAX_LOOP = 25;
    
    // initial estimation of lon/lat
    vec2 inv1 = invProjection(xy, mix1ProjectionID);
    vec2 inv2 = invProjection(xy, mix2ProjectionID);
    vec2 lonLat = mix(inv2, inv1, mixWeight);
    
    for (int i = 0; i < MAX_LOOP; i++) {
        // difference in projected coordinates
        vec2 dxy = xy - projectionMix(vec2(lonLat)).xy;
        // add half of the horizontal and vertical difference to the longitude and the latitude
        lonLat += dxy * 0.5;
        // to guarantee stable forward projection, latitude must not go beyond +/-PI/2
        clamp(lonLat, vec2(-PI, -HALFPI), vec2(PI, HALFPI));
        // stop when difference is small enough
        if (all(lessThan(abs(dxy), vec2(EPS)))) {
            break;
        }
    }
    
    if (any(greaterThan(abs(lonLat), vec2(PI, HALFPI)))){
        discard;
    }
    return lonLat;
}

void main(void) {
    if (alongAntimeridian > 0.) {
        // inverse projection and texture sampling
        vec2 xy = (gl_FragCoord.xy - dXY) / scaleXY * 2.;
        xy.y -= falseNorthing;
        
        vec2 lonLat;
        if (projectionID == MIXPROJECTION) {
            lonLat = invProjectionMix(xy);
        } else {
            lonLat = invProjection(xy, projectionID);
        }
        
        if (cosLatPole != 0.) {
            lonLat = transformSphere(lonLat);
        }
        lonLat.x += meridian;
        
        gl_FragColor = texture2D(texture, lonLat / vec2(PI * 2., PI) + 0.5);
    } else {
        gl_FragColor = texture2D(texture, textureCoord);
    }
    
}