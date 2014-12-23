/**
 * Vector layer styling options
 *
 * Transparency:
 * globalAlpha (0 is transparent, 1 is opaque)
 *
 * Blend mode:
 * globalCompositeOperation: source-over, source-in,  source-out, source-atop, destination-over, destination-in, destination-out destination-atop, lighter, copy, xor
 *
 * Lines:
 * strokeStyle (stroke color)
 * lineWidth
 * lineCap: butt, round, square
 * lineJoin: round, bevel, miter (with miterLimit)
 *
 * Filling:
 * fillStyle (fill color)
 *
 * Drop Shadow:
 * shadowOffsetX
 * shadowOffsetY
 * shadowBlur
 * shadowColor
 *
 * Text:
 * font (css font styling, for example, "10px sans-serif")
 * options for embeded Google webfont 'Open Sans': 300 (Book), 400 (Normal), 600 (Semi-Bold), 700 (Bold), 800 (Extra-Bold), 300 Italic, 400 Italic, 600 Italic, 700 Italic, 800 Italic
 * textAlign (horizontal alignment): start, end, left, right, center
 * textBaseline (vertical alignment, default is alphabetic): top, hanging, middle, alphabetic, ideographic, bottom
 */

function getLayers(map) { "use strict";

    var maps = [];
    var videoElement = document.getElementById("video1");
    var layers = [
    
    new VideoLayer(videoElement, map),

    // country border lines
    new PolylineLayer("NASA/110m_cultural/ne_110m_admin_0_boundary_lines_land", {
        strokeStyle : 'white',
        globalAlpha : 0.75,
        lineWidth : [{
            scale : 0,
            width : 0.1
        }, {
            scale : 1,
            width : 0.5
        }]
    }, {
        layerMinScale : 0,
        layerMaxScale : 10
    }, "countries"),

    // coastlines
    new PolylineLayer("NASA/110m_physical/ne_110m_coastline", {
        strokeStyle : 'white',
        globalAlpha : 0.9,
        lineWidth : [{
            scale : 0,
            width : 0.1
        }, {
            scale : 1,
            width : 0.5
        }]
    }, {
        layerMinScale : 0,
        layerMaxScale : 10
    }, "land"),

    // lakes
    new PolylineLayer("NASA/110m_physical/ne_110m_lakes", {
        fillStyle : 'white',
        globalAlpha : 0.4
    }, {
        layerMinScale : 0,
        layerMaxScale : 10
    }, "lakes"),

/*    // populated places
    new PointLayer("NASA/110m_physical/ne_110m_populated_places_simple", {
        AM_symbolDim : 10,
        fillStyle : "#fff"
    }, {
        layerMinScale : 0,
        layerMaxScale : 10,
        //featureMinScaleAtt : 'longfrom', // optional: column with minimum scale for the label to appear
        //featureSymbolScale : 'LABELRANK' // optional: set to 0 to hide the dot. Not sure this works.
    }),
*/
    new Graticule({
    	// white graticule lines
        strokeStyle : '#fff',
        // white pole point
        fillStyle: '#fff',
        lineWidth : 1,
        globalAlpha : 0.5
    }, null, // scale visibility
    1, // radius of pole point in pixels
    15 // distance of meridian lines from poles in pixels
    ),

    new GraticuleOutline({
        strokeStyle : '#222',
        lineWidth : 1.5,
        globalAlpha : 1
    })];

    maps.push(layers);    
    
    return maps;
}