Adaptive Composite Map Projections
==================================

## General Structure

* index.html main HTML
* UI.js: builds and handles sliders, buttons and other user interface elements,
* AdaptiveCompositeMap.js: the projection logic and map/map layers code, 
* MapContent.js: defines the map layers and their styling,
* and a bunch of third-party JavaScript libraries that are all in the /lib/ folder.

JavaScript source code is in the /src/ folder.
Run Apache Ant to build the JavaScript file AdaptiveCompositeMap.js. (When Apache Ant is installed, open a command line / terminal, change the current directory to the project folder, then type ant).

## Source Code /src/
### map.js
* Contains the AdaptiveMap object.
* Handles an array of layers.
* Data model for current settings, such as map scale, central meridian and central latitude, with setters and getters.
* Links between the canvas (pixel coordinates), unprojected geographic coordinates (lat/lon), and projected Cartesian coordinates (X/Y).
* the updateProjection() function has to be called whenever the projection changes. This function will call ProjectionFactory.create() (in Projection.js) with the appropriate parameters (current map scale, current central meridian, etc.).

### MapEvents.js
event handler for all map-related events

### ProjectionDiagram.js
Draws the diagram (scale on horizontal axis, central latitude on vertical axis) to illustrate how projections are combined. Also handles events for this diagram.

### shapefile.js, binarywrapper.js, dbf.js
For loading shapefiles.

### Utils.js.
Low level JavaScript stuff and DOM manipulation

### WebGL.js
WebGL (OpenGL for the web) logic for raster projection. This is the low level OpenGL related rendering code. Projection logic is in the /src/projections/ folder. WebGL uses shader programs, which are in src/shader/fs/ and src/shader/vs/.

### /layers/
Contains various types of layers. All layers derive from AbstractLayer in Layer.js
Example layers: graticule (with self-adjusting line density), tropics and polar circles, a graticule outline, points, polylines, raster, video.

## /projections/
Contains the different map projections. Names are self-explanatory. Each projection file contains:
* a forward() and and an inverse() function, converting between lon/lat in radians and X/Y on the unary sphere.
* getOutline: returns a  projected line along the border of the graticule. Derived projections use the various functions in /layers/GraticuleOutline.js to construct these lines.
* getShaderUniforms: a set of per projection parameters for configuring the WebGL shader programs.

### /projections/WeightedProjectionMix.js
WeightedProjectionMix is a wrapper around two other projections that are blended using a weighted mean. This is itself a projection, that is, it has forward(), inverse(), and other required functions. 
Note: WeightedProjectionMix is not generally used. It is only used when the projection for small-scale world maps cannot be constructed via a transformation of the Lambert azimuthal projection used for intermediate scales. An example is the Robinson. The resulting Robinson-Lambert blend is not equal-area. WeightedProjectionMix is not used when the world projection is the Hammer, Wagner VII, or Bojan's pseudocylindrical. For these projections, intermediate projections can be computed on the fly, which are equal-area throughout the transformation to the Lambert azimuthal.

### /projections/TransformedLambertAzimuthal.js
TransformedLambertAzimuthal can be transformed between the Lambert azimuthal and a series of other projections for world maps. All projections are equal area throughout the transformation. World projections include Hammer, Wagner VII, quartic authalic, Bojan's pseudocylindrical, and others. The Lambert azimuthal can also be transformed to the cylindrical equal-area projection (with different standard parallels, including the Lambert cylindrical).
The transformation between the Lambert azimuthal and the various other projections is controlled by a weight parameter, which is set with transformToLambertAzimuthal().
The constructor of TransformedLambertAzimuthal takes three paramaters that define the shape of the world projection. There are "static constructors" calling the object constructor with preset parameters to create the various predefined projections, for example, TransformedLambertAzimuthal.Hammer() creates a Hammer projection.

### ProjectionFactory in /projections/Projection.js
Projection.js contains a ProjectionFactory object that creates a projection based on the current user settings and the canvas size.

** Note: This object contains the entire logic, which is under ongoing development. As such, the code is even messier than the rest and also poorly documented.**

The factory method in ProjectionFactory is create(). The parameter for this function is a configuration object with a bunch of parameters. Parameters are accessed with conf.parameterName. And no, this code is not documented - sorry. This is where the mess is. It is urgent for us to fix this conf object to make it clearer to understand.

The create() function contains a set of private functions. The private functions initialize projections for certain cases, for example, getMediumScaleProjection() returns a Lambert azimuthal used for maps showing continents.

The private create() function inside ProjectionFactory.create() contains the main branch. It is where various private functions are called, mainly based on the current scale. It is best to visualize the interactive projection diagram on the website in parallel for a better understanding. The many if statements start from the right side of the diagram (largest scale, that is, Mercator for web maps).

Note: The many if statements can be considerably simplified for a desktop GIS, because many special cases are required for creating smooth transitions as scale changes. For example, there is an oblique conic projection included to create a smooth transition to the Lambert azimuthal. This is might not be required for a desktop application. The create() function for a desktop GIS will simplify to:

```
if (conf.mapScale > conf.scaleLimit5) {
	// large scale: polar azimuthal, Albers conic, Lambert cylindrical for equator
	projection = ProjectionFactory.createLargeScaleProjection(conf);
} else if (conf.mapScale >= conf.scaleLimit2) {
	// Lambert azimuthal
    projection = getMediumScaleProjection(conf);
} else if (conf.mapScale > conf.scaleLimit1) {
	// small-scale projection blended with Lambert azimuthal for medium scale
    projection = getSmallToMediumScaleProjection(conf);
} else {
	// conf.mapScale < conf.scaleLimit1
    // small-scale projection
    projection = smallScaleTransformation(conf, ProjectionFactory.getSmallScaleProjection(conf.smallScaleProjectionName));
}
```

#### ProjectionFactory.createLargeScaleProjection()
Creates a large scale projection depending on the aspect ratio of the map. If the map has a landscape aspect, one of these three projections is used (from pole to equator): polar Lambert azimuthal, Albers conic, Lambert cylindrical. If the map has a portrait format, a transverse Lambert cylindrical equal-area is used. If the map has a square format, an oblique Lambert azimuthal projection is used, with a central meridian and a central parallel set to the current map center. To differentiate between the three formats, we currently use 0.8 (formatRatioLimit), but have not done a numerical analysis to find that value. If height / width < 0.8, then we have a landscape format map. If height / width > 1/0.8 then we have a landscape map. Otherwise we have a square map.

The square and portrait format are simple. The landscape format is tricky, because a transition is required between three projections (Lambert azimuthal polar, Albers conic, and Lambert cylindrical). The following paragraphs provide details for the landscape format.

As for both the Lambert cylindrical (close to the equator), and the polar azimuthal, the graticule is shifted vertically when the user pans the map vertically. The vertical shift is computed by projecting the central latitude (the latitude that should appear at the center of the map).

The Albers conic for large scales is configured in ProjectionFactory.largeScaleAlbersConicForLandscapeFormat(). Standard parallels have to be computed. We don't have a bulletproof method for computing them. There exist rules of thumb for the placement of the standard parallels, see Snyder 1987 Map Projections – A working manual, page 99. We use the recommendation by Deetz and Adams and place the standard parallels at 1/6 of the displayed length of the central meridian. Note: In the web version, the location of the standard parallels can be visualized when selecting "Show map overlay" in the Debug panel. We first initialize a Lambert azimuthal (centering on the center of the map) and compute the length of the vertical central meridian by inverse projecting the XY coordinates of the topmost and bottommost point on the central meridian. Then we place the standard parallels at one sixth from the top and bottom of the visible section of the central meridian. This is probably not the best method, as it will not reduce overall distortion for the displayed area. In fact, an iterative approach could possibly be used here, where standard parallels are adjusted, distortion measured, standard parallels adjusted again, etc. Not sure this would converge, though.

When the central latitude is close to either the pole or the equator, the standard parallels are adjusted to create a smooth transition towards the azimuthal (for poles) and cylindrical (for the equator). We do this with linear weights, see largeScaleAlbersConicForLandscapeFormat().  

We make sure the pole line of the Albers conic is never visible. The curved line in the projection diagram shows the latitude at which the pole is just visible. The latitude boundary between the upper polar azimuthal and the lower conic has to be lower than this curved line, otherwise the pole line of the conic would become visible.

#### ProjectionFactory.getMediumScaleProjection()
This is an oblique Lambert azimuthal with the central latitude set to the map center. That is, equatorial aspect when the central latitude is on the equator, and polar aspect when the central latitude is equal to a pole. However, there is a complication near poles, because at large scales the Lambert azimuthal is used for polar areas. There, the polar azimuthal is not only used when the central latitude of the map is exactly on a pole, but also when the central latitude is close to a pole. To create a smooth transition between medium and large scales near poles, the central latitude of the medium scale azimuthal is adjusted linearly with the scale factor. Note that an additional vertical shift is required to compensate for this implied rotation.

#### ProjectionFactory.getSmallToMediumScaleProjection()
This creates either a transformed Lambert azimuthal projection (see  /projections/TransformedLambertAzimuthal.js above) or a mix of two projection (see /projections/WeightedProjectionMix.js above).

## Zoom Factor
Projections are selected based on a zoom factor (and the aspect ratio of the map). This zoom factor is independent of the current scale of the map. A world map covering the entire screen uses a the same map projection as a a world map covering a fraction of the screen. The scale for these two maps is clearly different, but the zoom factor is identical. A map has a zoom factor of 1 if its central meridian vertically fills the available canvas space. In other words, at zoom factor 1, the length of central meridian is identical to the height of the canvas. A zoom factor of 2 means that half of central meridian is visible.

A zoom factor of 1 only guarantees that the entire central meridian is visible. The left and right sections of a graticule might might be invisible if the canvas is relatively narrow. Also, if the Wagner VII projection is used for world maps, not the entire graticule is visible, because for this projection the central meridian is shorter than the maximum vertical extent of the graticule.




