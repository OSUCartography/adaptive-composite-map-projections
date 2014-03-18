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

#define TRANSFORMED_WAGNER_ID 654267985.
#define NATURAL_EARTH_ID 7259365.
#define CANTERS1_ID 53287562.
#define CANTERS2_ID 38426587.
#define CYLINDRICAL_EQUAL_AREA_ID -1.
#define MIXPROJECTION -9999.0

// FIXME should be int
uniform float projectionID;

uniform sampler2D texture;
varying vec2 textureCoord;
varying float alongAntimeridian;

uniform vec2 scaleXY;
uniform vec2 dXY;

// vertical shift
uniform float falseNorthing;

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
// FIXME prepend with "albers"
uniform float n;
uniform float c;
uniform float rho0;

vec2 transformSphere(in vec2 lonLat) {
    vec2 sinLonLat = sin(lonLat);
	vec2 cosLonLat = cos(lonLat);
	float sinLon = sinLonLat.x;
	float cosLon = cosLonLat.x;
	float sinLat = sinLonLat.y;
	float cosLat = cosLonLat.y;
	float cosLat_x_cosLon = cosLat * cosLon;
	
	// TODO can this be optimized using vec2 for sinLatPole and cosLatPole?
	// FIXME normalize
	float lon = /*normalizeLam(*/atan(cosLat * sinLon, sinLatPole * cosLat_x_cosLon + cosLatPole * sinLat)/*)*/;
	float lat = asin(sinLatPole * sinLat - cosLatPole * cosLat_x_cosLon);
	
	// shift longitude by central longitude
    // FIXME
    // causes flickering along +/-180deg
	//lon = 2.0 * PI * (fract(0.5 * M_1_PI * (lon + meridian) + 0.5) - 0.5);
    // causes vertical line beyond poles > normalize lon?
    //lon += meridian;
    
	return vec2(lon, lat);
}

vec2 invGeographic(in vec2 xy) {
    if (any(lessThan(xy, vec2(-PI, -PI/2.))) || any(greaterThan(xy, vec2(PI, PI/2.)))) {
        discard;
    }
    return xy;
}

vec2 invSinusoidal(in vec2 xy) {
    float lat = xy.y;
    if (lat > PI / 2. || lat < -PI / 2.) {
        discard;
    }
    float lon = xy.x / cos(xy.y);
    if (lon > PI || lon < -PI) {
        discard;
    }
    return vec2 (lon, xy.y);
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
    xy.y = rho0 - xy.y;
    float rho = length(xy);
    if (rho == 0.) {
        return vec2(0., n > 0. ? PI / 2. : -PI / 2.);
    }
    float lon, lat;
    float phi = rho * n;
    phi = (c - phi * phi) / (n * 2.);
    if (abs(phi) > 1.) {
        discard;
    }
    lat = asin(phi);
    
    if (n < 0.) {
        lon = atan(-xy.x, -xy.y) / n;
    } else {
        lon = atan(xy.x, xy.y) / n;
    }
    if (lon > PI || lon < -PI) {
        discard;
    }
    return vec2(lon, lat);
}

vec2 invCylindricalEqualArea(in vec2 xy) {
    if (xy.x > PI || xy.x < -PI || xy.y > 1. || xy.y < -1.) {
        discard;
    }
    return vec2(xy.x, asin(xy.y));
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
    /*
     if (projectionID == CANTERS1_ID) {
     return canters1(lon, lat);
     } else if (projectionID == CANTERS2_ID) {
     return canters2(lon, lat);
     }*/
    else if (projectionID == CYLINDRICAL_EQUAL_AREA_ID) {
		return invCylindricalEqualArea(xy);
	}
    // continental scale projection
	else if (projectionID == 28.){
		return invLambertAzimuthalNorthPolar(xy);
	}
	
	// continental and regional scale projections
	else if (projectionID == 11.) {
		return invAlbersConic(xy);
	}
    else if (projectionID == -2.) {
		return invLambertAzimuthalNorthPolar(xy);
	}
    else {//if (projectionID == -3.) {
		return invLambertAzimuthalSouthPolar(xy);
	}
    /*
     if (projectionID == EPSG_MERCATOR) {
     return mercator(lon, lat);
     }
     if (projectionID == EPSG_LAMBERT_CYLINDRICAL_TRANSVERSE) {
     return lambertCylindricalTransverse(lon, lat);
     }
     */
    //discard;
}


void main(void) {
    if (alongAntimeridian > 0.) {
        vec2 xy = (gl_FragCoord.xy - dXY) / scaleXY * 2.;
        xy.y -= falseNorthing;
        
        vec2 lonLat;
        if (projectionID == MIXPROJECTION) {
            // FIXME missing, see v15
            lonLat = invProjection/*invProjectionMix*/(xy, projectionID);
        } else {
            lonLat = invProjection(xy, projectionID);
        }
        
        if (cosLatPole != 0.) {
            lonLat = transformSphere(lonLat);
        }
        lonLat.x += meridian;

        // FIXME: use gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); when texture is loaded instead
        lonLat.y *= -1.;
  
        gl_FragColor = texture2D(texture, lonLat / vec2(PI * 2., PI) + 0.5);
        /*if (meridian > 0.) {
            gl_FragColor.r = 1.;
        }*/
    } else {
        gl_FragColor = texture2D(texture, textureCoord);
    }
	
}