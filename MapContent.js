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
    var riverStrokeColor = '#aaa';
    var scaleSwitch1 = 6;
    var scaleSwitch2 = 20;
    var labelScaleSwitch1 = 2;
    var labelScaleSwitch2 = 4;
    var labelScaleSwitch3 = 11;
    var layers = [new GraticuleOutline({
        fillStyle : 'black'
        // shadows would be nice here, but they would slow down rendering
    }),
    /*
    new PolylineLayer("data_layers/Antarctica2", {
    fillStyle : 'green',
    }, {
    layerMinScale : 0,
    layerMaxScale : scaleSwitch1
    }),
    */
    /**
     * 1:110 million
     */

    new PolylineLayer("data_layers/110m/110m-land/110m_land", {
        fillStyle : 'white',
    }, {
        layerMinScale : 0,
        layerMaxScale : scaleSwitch1
    }), new PolylineLayer("data_layers/110m/110m-lakes/110m_lakes", {
        fillStyle : 'black',
    }, {
        layerMinScale : 0,
        layerMaxScale : scaleSwitch1
    }), new PolylineLayer("data_layers/110m/110m-admin-0-boundary-lines/110m_admin_0_boundary_lines_land", {
        strokeStyle : 'black',
        lineWidth : [{
            scale : 0,
            width : 0.1
        }, {
            scale : 1,
            width : 1
        }]
    }, {
        layerMinScale : 0,
        layerMaxScale : scaleSwitch1
    }),

    /*
    new PolylineLayer("data_layers/50m/50m-rivers-lake-centerlines-with-scale-ranks/50m-rivers-lake-centerlines-with-scale-ranks", {
    strokeStyle : 'gray',
    lineWidth : [{scale : 0, width : 0.5}, {scale : 1, width : 2}, {scale : 4, width : 4}],
    AM_lineWidthScaleAtt : "StrokeWeig",
    lineCap: "round"
    }, {
    layerMinScale : 0,
    layerMaxScale : scaleSwitch1
    }),
    */

    /**
     * 1:50 million
     */
    new PolylineLayer("data_layers/50m/50m-land/50m_land", {
        fillStyle : 'white',
    }, {
        layerMinScale : scaleSwitch1,
        layerMaxScale : scaleSwitch2
    }), new PolylineLayer("data_layers/50m/50m-lakes/50m-lakes", {
        fillStyle : 'black',
    }, {
        layerMinScale : scaleSwitch1,
        layerMaxScale : scaleSwitch2
    }), new PolylineLayer("data_layers/50m/50m-admin-0-boundary-lines-land/ne_50m_admin_0_boundary_lines_land", {
        strokeStyle : 'black',
        lineWidth : 1
    }, {
        layerMinScale : scaleSwitch1,
        layerMaxScale : scaleSwitch2
    }), new Graticule({
        strokeStyle : '#bbb',
        lineWidth : 2,
        globalAlpha : 0.5,
    }, null, // scale visibility
    2, // radius of pole point in pixels
    15 // distance of meridian lines from poles in pixels
    ),

    /**
     * labels level 1
     */

    new PointLayer("data_layers/labels/level1/countries_1_1", {
        font : "normal 600 #px 'Open Sans', sans-serif",
        AM_fontSize : [{
            scale : 2,
            fontSize : 10.5
        }, {
            scale : 4,
            fontSize : 14
        }], // replaces # in font attribute with interpolated value
        //        AM_positions : [{scale : 3.5, lon : 'scale3x', lat : 'scale3y'}, {scale : 4.5, lon : 'scale6x', lat : 'scale6y'}]
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME_SORT', // column with labels in DBF file
        AM_lineHeight : 14, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel'//'round',
    }, {
        layerMinScale : labelScaleSwitch1,
        layerMaxScale : labelScaleSwitch2,
        //featureMinScaleAtt : 'longfrom', // optional: column with minimum scale for the label to appear
        //featureSymbolScale : 'LABELRANK' // optional: set to 0 to hide the dot. Not sure this works.
    }), new PointLayer("data_layers/labels/level1/countries_1_2", {
        font : "normal 600 #px 'Open Sans', sans-serif", // css font style
        AM_fontSize : [{
            scale : 2,
            fontSize : 9
        }, {
            scale : 4,
            fontSize : 11
        }], // replaces # in font attribute with interpolated value
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME_SORT', // column with labels in DBF file
        AM_lineHeight : 12, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel'//'round',
    }, {
        layerMinScale : labelScaleSwitch1,
        layerMaxScale : labelScaleSwitch2,
    }),

    /**
     * labels level 2
     */
    new PointLayer("data_layers/labels/level2/countries_2_1", {
        //fillStyle : 'red',
        //strokeStyle : 'black',
        //lineWidth : 1,
        //AM_symbolType : 'circle',	// circle or square
        //AM_symbolDim : 5,	// diameter of the symbol. If not defined or smaller than 0, symbols are not drawn.
        font : "normal 600 #px 'Open Sans', sans-serif", // css font style
        AM_fontSize : [{
            scale : labelScaleSwitch2,
            fontSize : 14
        }, {
            scale : labelScaleSwitch3,
            fontSize : 18
        }],
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME_SORT', // column with labels in DBF file
        AM_lineHeight : 15, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel'//'round',
    }, {
        layerMinScale : labelScaleSwitch2,
        layerMaxScale : labelScaleSwitch3,
    }), new PointLayer("data_layers/labels/level2/countries_2_2", {
        font : "normal 600 #px 'Open Sans', sans-serif", // css font style
        AM_fontSize : [{
            scale : labelScaleSwitch2,
            fontSize : 11
        }, {
            scale : labelScaleSwitch3,
            fontSize : 15
        }],
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME_SORT', // column with labels in DBF file
        AM_lineHeight : 13, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel'//'round',
    }, {
        layerMinScale : labelScaleSwitch2,
        layerMaxScale : labelScaleSwitch3,
    }), new PointLayer("data_layers/labels/level2/cities_2", {
        //fillStyle : 'white',
        strokeStyle : 'white',
        lineWidth : 1,
        AM_symbolType : 'circle', // circle or square

        AM_fontSize : [{
            scale : labelScaleSwitch2,
            fontSize : 10
        }, {
            scale : labelScaleSwitch3,
            fontSize : 13
        }],

        //AM_symbolDim : 5,	// diameter of the symbol. If not defined or smaller than 0, symbols are not drawn.
        AM_symbolDim : [{
            scale : labelScaleSwitch2,
            dim : 5
        }, {
            scale : labelScaleSwitch2 + 1,
            dim : 7
        }],
        AM_symbolDim2 : [{
            scale : labelScaleSwitch2,
            dim : 3
        }, {
            scale : labelScaleSwitch2 + 1,
            dim : 5
        }],
        AM_fillStyle2 : 'black',
        //AM_strokeStyle2 : 'black',
        AM_lineWidth2 : 1,
        AM_labelOffsetX : 0.2,
        AM_labelOffsetY : 0.2,
        font : "normal 400 #px 'Open Sans', sans-serif", // css font style
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME', // column with labels in DBF file
        AM_lineHeight : 13, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel'//'round',
    }, {
        layerMinScale : labelScaleSwitch2,
        layerMaxScale : labelScaleSwitch2 + 1
    }), new PointLayer("data_layers/labels/level2/cities_2", {
        fillStyle : 'white',
        strokeStyle : 'black',
        lineWidth : 1,
        AM_symbolType : 'circle', // circle or square

        AM_fontSize : [{
            scale : labelScaleSwitch2,
            fontSize : 10
        }, {
            scale : labelScaleSwitch3,
            fontSize : 13
        }],

        //AM_symbolDim : 5, // diameter of the symbol. If not defined or smaller than 0, symbols are not drawn.
        AM_symbolDim : [{
            scale : labelScaleSwitch2 + 1,
            dim : 4
        }, {
            scale : labelScaleSwitch3,
            dim : 8
        }],
        AM_symbolDim2 : [{
            scale : labelScaleSwitch2 + 1,
            dim : 0
        }, {
            scale : 5.99,
            dim : 0
        }, {
            scale : 6,
            dim : 2
        }, {
            scale : labelScaleSwitch3,
            dim : 4
        }],
        AM_fillStyle2 : 'black',
        //AM_strokeStyle2 : 'black',
        AM_lineWidth2 : 1,
        AM_labelOffsetX : 0.2,
        AM_labelOffsetY : 0.2,
        font : "normal 400 #px 'Open Sans', sans-serif", // css font style
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME', // column with labels in DBF file
        AM_lineHeight : 13, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel'//'round',
    }, {
        layerMinScale : labelScaleSwitch2 + 1,
        layerMaxScale : labelScaleSwitch3
    }),

    /**
     * labels level 4
     */
    new PointLayer("data_layers/labels/level4/countries_4-1", {
        font : "normal 600 18px 'Open Sans', sans-serif", // css font style
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME_SORT', // column with labels in DBF file
        AM_lineHeight : 13, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel',
    }, {
        layerMinScale : labelScaleSwitch3,
        layerMaxScale : 15,
    }), new PointLayer("data_layers/labels/level4/countries_4-2", {
        font : "normal 600 15px 'Open Sans', sans-serif", // css font style
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME_SORT', // column with labels in DBF file
        AM_lineHeight : 13, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel',
    }, {
        layerMinScale : labelScaleSwitch3,
        layerMaxScale : 15,
    }), new PointLayer("data_layers/labels/level4/countries_4-3", {
        font : "normal 600 13px 'Open Sans', sans-serif", // css font style
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME_SORT', // column with labels in DBF file
        AM_lineHeight : 13, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel',
    }, {
        layerMinScale : labelScaleSwitch3,
        layerMaxScale : 15,
    }), new PointLayer("data_layers/labels/level4/countries_4-4", {
        font : "normal 600 11px 'Open Sans', sans-serif", // css font style
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAME_SORT', // column with labels in DBF file
        AM_lineHeight : 13, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel',
    }, {
        layerMinScale : labelScaleSwitch3,
        layerMaxScale : 15,
    }), new PointLayer("data_layers/labels/level4/cities_4", {
        fillStyle : 'white',
        strokeStyle : 'black',
        lineWidth : 1,
        AM_symbolType : 'circle', // circle or square
        AM_symbolDim : 5, // diameter of the symbol. If not defined or smaller than 0, symbols are not drawn.
        AM_labelOffsetX : 0.2,
        AM_labelOffsetY : 0.2,
        font : "normal 400 12px 'Open Sans', sans-serif", // css font style
        textAlign : 'textAlign',
        textBaseline : 'middle',
        AM_textProp : 'NAMEASCII', // column with labels in DBF file
        AM_lineHeight : 13, // line height for multi-line labels
        AM_labelColor : 'black', // color of text labels
        AM_haloColor : 'white', // color of halo around text labels
        AM_labelHaloWidth : 3, // width of halos
        lineJoin : 'bevel',
    }, {
        layerMinScale : labelScaleSwitch3,
        layerMaxScale : 15,
    }), new GraticuleOutline({
        strokeStyle : '#bbb',
        lineWidth : 1
    })

    /*
     new DistanceTool({
     strokeStyle : 'orange',
     fillStyle : 'white',
     lineWidth : 1
     }),
     */
    ];
    //maps.push(layers);

    /**
     * Natural Earth Raster
     */
    layers = [new RasterLayer("data_layers/NE_8192x4096.jpg"), // NE_16384x8192.jpg"), // project-quicksilver.jpg"), //NE_8192x4096.jpg"),

    new Graticule({
        strokeStyle : '#444',
        lineWidth : 1,
        globalAlpha : 0.5
    }, null, // scale visibility
    2, // radius of pole point in pixels
    15 // distance of meridian lines from poles in pixels
    ), new GraticuleOutline({
        strokeStyle : '#666',
        lineWidth : 2,
        globalAlpha : 0.5
    })];

    maps.push(layers);
    
    /**
     * Video1
     */
    var videoElement1 = document.getElementById("video1");
    layers = [new VideoLayer(videoElement1, map), new Graticule({
        strokeStyle : '#444',
        lineWidth : 1,
        globalAlpha : 0.5
    }, null, // scale visibility
    2, // radius of pole point in pixels
    15 // distance of meridian lines from poles in pixels
    ), new GraticuleOutline({
        strokeStyle : '#444',
        lineWidth : 1,
        globalAlpha : 0.5
    })];

    maps.push(layers);

    /**
     * Video2
     */
    var videoElement2 = document.getElementById("video2");
    layers = [new VideoLayer(videoElement2, map), new Graticule({
        strokeStyle : '#444',
        lineWidth : 1,
        globalAlpha : 0.5
    }, null, // scale visibility
    2, // radius of pole point in pixels
    15 // distance of meridian lines from poles in pixels
    ), new GraticuleOutline({
        strokeStyle : '#444',
        lineWidth : 1,
        globalAlpha : 0.5
    })];

    maps.push(layers);

    /**
     * Video3
     */
    var videoElement3 = document.getElementById("video3");
    layers = [new VideoLayer(videoElement3, map), new Graticule({
        strokeStyle : '#444',
        lineWidth : 1,
        globalAlpha : 0.5
    }, null, // scale visibility
    2, // radius of pole point in pixels
    15 // distance of meridian lines from poles in pixels
    ), new GraticuleOutline({
        strokeStyle : '#444',
        lineWidth : 1,
        globalAlpha : 0.5
    })];

    maps.push(layers);    

    /**
     * Graticule only
     */
    layers = [new GraticuleOutline({
        strokeStyle : 'orange',
        lineWidth : 4,
        fillStyle : '#eeeeff'
    }), new Graticule({
        strokeStyle : 'black',
        lineWidth : 1,
    }, null, // scale visibility
    2, // radius of pole point in pixels
    15 // distance of meridian lines from poles in pixels
    ), new PolarCircles({
        strokeStyle : 'blue',
        lineWidth : 1,
        globalAlpha : 0.5
    }), new Tropics({
        strokeStyle : 'purple',
        lineWidth : 1,
        globalAlpha : 0.5
    })];
    maps.push(layers);

	layers = [new RasterLayer("data_layers/black_512x256.jpg"),

    new Graticule({
        strokeStyle : '#fff',
        fillStyle : '#fff',
        lineWidth : 2,
        globalAlpha : 1
    }, null, // scale visibility
    2, // radius of pole point in pixels
    15 // distance of meridian lines from poles in pixels
    )];
    maps.push(layers);
    
    return maps;
}