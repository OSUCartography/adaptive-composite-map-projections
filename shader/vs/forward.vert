// precision highp float;

#define PI 3.14159265358979323846
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
			
uniform mat4 modelViewProjMatrix;
attribute vec2 vPosition;
varying vec2 textureCoord;
varying float alongAntimeridian;

//varying vec3 worldCoord;
//varying vec3 posToLight;
//varying float diffuse;

//flag for strips
//uniform int flagStrips;

// hack: size of cell in radians
uniform float cellsize;

uniform float projectionID;

// projections to mix and weight for the mix
// FIXME should be integers
uniform float mix1ProjectionID;
uniform float mix2ProjectionID;
uniform float mixWeight;


// spherical rotation
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
    lon = 2.0 * PI * (fract(0.5 * M_1_PI * (lon + meridian) + 0.5) - 0.5);
	/*
    if (flagStrips == 1) {
        lonLat.x = 2.0 * PI * (fract(0.5 * M_1_PI * (lonLat.x - meridian) + 0.5) - 0.5);
        
        sinLonLat = sin(lonLat);
        cosLonLat = cos(lonLat);
        sinLon = sinLonLat.x;
        cosLon = cosLonLat.x;
        sinLat = sinLonLat.y;
        cosLat = cosLonLat.y;
        cosLat_x_cosLon = cosLat * cosLon;
        
        
        
        lon = atan(cosLat * sinLon, sinLatPole * cosLat_x_cosLon - cosLatPole * sinLat);
        lat = asin(sinLatPole * sinLat + cosLatPole * cosLat_x_cosLon);
    

    }*/

	return vec2(lon, lat);
}

// A polynomial version of the Robinson projection.
// Canters, F., Decleir, H. 1989. The world in perspective – A directory of 
// world map projections. Chichester, John Wiley and Sons: p. 143.
vec4 robinson(in vec2 lonLat) {
    //float x = lon * (0.8507 - lat2 * (0.1450 + lat2 * 0.0104));
    //float y = lat * (0.9642 - lat2 * (0.0013 + lat2 * 0.0129));

    vec2 lat2 = vec2(lonLat.y * lonLat.y);
    vec2 xy = lat2 * vec2(0.0104, 0.0129);
    xy += vec2(0.1450, 0.0013);
    xy *= -lat2;
    xy += vec2(0.8507, 0.9642);
    xy *= lonLat;        
    return vec4(xy.x, xy.y + falseNorthing, 0., 1.);
}

// B. Savric et al., A polynomial equation for the Natural Earth projection,
// in: Cartography and Geographic Information Science, 38-4, pp. 363–372, 2011.
vec4 naturalEarth(in float lon, in float lat) {
	float lat2 = lat * lat;
    float lat4 = lat2 * lat2;
    float x = lon * (0.8707 - 0.131979 * lat2 + lat4 * (-0.013791 + lat4 * (0.003971 * lat2 - 0.001529 * lat4)));
    float y = lat * (1.007226 + lat2 * (0.015085 + lat4 * (-0.044475 + 0.028874 * lat2 - 0.005916 * lat4)));
	return vec4(x, y + falseNorthing, 0., 1.);
}

vec4 geographic(in float lon, in float lat) {
	return vec4(lon, lat + falseNorthing, 0., 1.);
}

vec4 sinusoidal(in float lon, in float lat) {
	float x = lon * cos(lat);
	return vec4(x, lat + falseNorthing, 0., 1.);
}

// Canters, F. (2002) Small-scale Map projection Design. p. 218-219.
// Modified Sinusoidal, equal-area.
vec4 canters1(in float lon, in float lat) {
	const float C1 = 1.1966;
    const float C3 = -0.1290;
    const float C3x3 = 3. * C3;
    const float C5 = -0.0076;
    const float C5x5 = 5. * C5;
	float y2 = lat * lat;
	float y4 = y2 * y2;
	float x = lon * cos(lat) / (C1 + C3x3 * y2 + C5x5 * y4);
	float y = lat * (C1 + C3 * y2 + C5 * y4);
	return vec4(x, y + falseNorthing, 0., 1.);
}

// Canters, F. (2002) Small-scale Map projection Design. p. 218-220.
// Modified Sinusoidal, equal-area.
vec4 canters2(in float lon, in float lat) {
	const float C1 = 1.1481;
    const float C3 = -0.0753;
    const float C3x3 = 3. * C3;
    const float C5 = -0.0150;
    const float C5x5 = 5. * C5;
	float y2 = lat * lat;
	float y4 = y2 * y2;
	float x = lon * cos(lat) / (C1 + C3x3 * y2 + C5x5 * y4);
	float y = lat * (C1 + C3 * y2 + C5 * y4);
	return vec4(x, y + falseNorthing, 0., 1.);
}

vec4 cylindricalEqualArea(in float lon, in float lat) {
	float x = lon;
    float y = sin(lat);
	return vec4(x, y + falseNorthing, 0., 1.);
}

vec4 transformedWagner(in vec2 lonLat) {
	
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
	return vec4(x, y + falseNorthing, 0., 1.);
}
	
vec4 albersConic(in float lon, in float lat) {
	float rho = c - 2. * n * sin(lat);
	rho = sqrt(rho) / n;
	float n_x_lon = n * lon;
	float x = rho * sin(n_x_lon);
	float y = rho0 - rho * cos(n_x_lon);
	return vec4(x, y + falseNorthing, 0., 1.);
}

vec4 lambertAzimuthalNorthPolar(in float lon, in float lat) {
	float k = 2. * sin(PI / 4. - lat / 2.);
	float x = k * sin(lon);
	float y = -k * cos(lon);
	return vec4(x, y + falseNorthing, 0., 1.);
}

vec4 lambertAzimuthalSouthPolar(in float lon, in float lat) {
	float k = 2. * cos(PI / 4. - lat / 2.);
	float x = k * sin(lon);
	float y = k * cos(lon);
	return vec4(x, y + falseNorthing, 0., 1.);
}

vec4 mercator(in float lon, in float lat) {
	lat = clamp(lat, -WEB_MERCATOR_MAX_LAT, WEB_MERCATOR_MAX_LAT);
    float y = log(tan(0.5 * (PI / 2. + lat)));        
	return vec4(lon, y + falseNorthing, 0., 1.);
}

vec4 lambertCylindricalTransverse(in float lon, in float lat) {
	// FIXME
	float k0 = 1.;
	float lat0 = 0.;
	
	float x = cos(lat) * sin(lon) / k0;
	float y = k0 * (atan(tan(lat), cos(lon)) - lat0);
	return vec4(x, y + falseNorthing, 0., 1.);
}

vec4 project(in vec2 lonLat, in float projectionID) {
	float lon;
	float lat;
	
	lon = lonLat.x;
	lat = lonLat.y;
	
	// world map projections
	if (projectionID == TRANSFORMED_WAGNER_ID) {
		return transformedWagner(lonLat);
	} else if (projectionID == EPSG_ROBINSON) {
		return robinson(lonLat);
	} else if (projectionID == NATURAL_EARTH_ID) {
		return naturalEarth(lon, lat);
	} else if (projectionID == EPSG_GEOGRAPHIC) {
		return geographic(lon, lat);
	} else if (projectionID == EPSG_SINUSOIDAL) {
		return sinusoidal(lon, lat);
	} else if (projectionID == CANTERS1_ID) {
		return canters1(lon, lat);
	} else if (projectionID == CANTERS2_ID) {
		return canters2(lon, lat);
	} else if (projectionID == CYLINDRICAL_EQUAL_AREA_ID) {
		return cylindricalEqualArea(lon, lat);
	}
	
	// continental scale projection
	else if (projectionID == 28.){
		// FIXME should be replaced with polar aspects
		return lambertAzimuthalNorthPolar(lon, lat);
	}
	
	// continental and regional scale projections
	else if (projectionID == 11.) {
		return albersConic(lon, lat);
	} else if (projectionID == -2.) {
		return lambertAzimuthalNorthPolar(lon, lat);
	} else if (projectionID == -3.) {
		return lambertAzimuthalSouthPolar(lon, lat);
	} else if (projectionID == EPSG_MERCATOR) {
		return mercator(lon, lat);
	} else {//if (projectionID == EPSG_LAMBERT_CYLINDRICAL_TRANSVERSE) {
		return lambertCylindricalTransverse(lon, lat);
	}	
}

void main(void) {
    vec4 xy;
    vec2 lonLat = radians(vPosition);
    vec2 lonLatTransformed = transformSphere(lonLat);
    
    alongAntimeridian = (abs(abs(lonLatTransformed.x) - PI) <= cellsize) ? 1. : 0.;
    textureCoord = lonLatTransformed / vec2(2. * PI, -PI) + 0.5;
    
    if (projectionID == MIXPROJECTION) {
        vec4 xy1 = project(lonLat, mix1ProjectionID);
        vec4 xy2 = project(lonLat, mix2ProjectionID);
        xy2.y += falseNorthing2 - falseNorthing;
        xy = mix(xy2, xy1, mixWeight);
    } else {
        xy = project(lonLat, projectionID);
    }

  	gl_Position = modelViewProjMatrix * xy;
}