#define PI 3.14159265358979323846
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

uniform mat4 modelViewProjMatrix;
attribute vec2 vPosition;
varying vec2 textureCoord;
varying float alongAntimeridian;

// hack: size of cell in radians
uniform float cellsize;

// ID of the current projection
uniform float projectionID;

// projections to mix and weight for the mix
// FIXME should be integers
uniform float mix1ProjectionID;
uniform float mix2ProjectionID;
uniform float mixWeight;

// parameters for spherical rotation
uniform float sinLatPole;
uniform float cosLatPole;

// central meridian
uniform float meridian;

// vertical shift
uniform float falseNorthing;

// vertical shift for the second projection in a mix
uniform float falseNorthing2;

// parameters for transformed Lambert azimuthal
uniform float wagnerM;
uniform float wagnerN;
uniform float wagnerCA;
uniform float wagnerCB;

// parameters for Albers conic
uniform float albersC;
uniform float albersRho0;
uniform float albersN;

// spherical rotation
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
/*
 vec2 lambertAzimuthalOblique(in vec2 lonLat) {
 float lon = lonLat.x;
 float lat = lonLat.y;
 float sinLon = sin(lon);
 float cosLon = cos(lon);
 float sinLat = sin(lat);
 float cosLat = cos(lat);
 float y = 1. + sinLatPole * sinLat + cosLatPole * cosLat * cosLon;
 // the projection is indeterminate for lon = PI and lat = -lat0
 // this point would have to be plotted as a circle
 // The following Math.sqrt will return NaN in this case.
 y = sqrt(2. / y);
 float x = y * cosLat * sinLon;
 y = y * (cosLatPole * sinLat - sinLatPole * cosLat * cosLon);
 return vec2(x, y);
 }
 */
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
	//lat = clamp(lat, -WEB_MERCATOR_MAX_LAT, WEB_MERCATOR_MAX_LAT);
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
    // mix computes: xy2⋅(1−mixWeight)+xy1⋅mixWeight
    return mix(xy2, xy1, mixWeight);
}

void main(void) {
	vec2 xy, lonLatTransformed;
	vec2 lonLat = radians(vPosition);
    
    // FIXME a tentative solution for the transformation from Lambert azimuthal to Mercator for square format maps
    // first rotate geometry, then project
	if (projectionID == 123456.) {
		// shift longitude by central longitude
		lonLat.x = 2.0 * PI * (fract(0.5 * M_1_PI * (lonLat.x - meridian) + 0.5) - 0.5);
		lonLatTransformed = transformSphere(lonLat);
		vec2 transWagner = transformedWagner(lonLatTransformed);
		vec2 merc = mercator(lonLat);
		merc.y += falseNorthing2;
		xy = mix(merc, transWagner, mixWeight);
        
		alongAntimeridian = 0.;
		textureCoord = vPosition / vec2(360.0, -180.0) + 0.5;
	} else {
		lonLatTransformed = transformSphere(lonLat);
        
    	// shift by central meridian
    	lonLatTransformed.x = 2. * PI * (fract(0.5 * M_1_PI * (lonLatTransformed.x + meridian) + 0.5) - 0.5);
        
    	alongAntimeridian = 1. - step(cellsize, abs(abs(lonLatTransformed.x) - PI));
        
    	textureCoord = lonLatTransformed / vec2(2. * PI, -PI) + 0.5;
        
    	if (projectionID == MIXPROJECTION) {
    		xy = projectionMix(lonLat);
    	} else {
    		xy = project(lonLat, projectionID);
    		xy.y += falseNorthing;
    	}
    }
    gl_Position = modelViewProjMatrix * vec4(xy, 0., 1.);
}