'use strict';
var StateGraph = require( 'osg/StateGraph' );

var CacheUniformApply = function ( state, program ) {
    this.modelWorldUniform = program._uniformsCache[ state.modelWorldMatrix.getName() ];
    this.viewUniform = program._uniformsCache[ state.viewMatrix.getName() ];

    this.apply = undefined;
    this.generateUniformsApplyMethods();
};

CacheUniformApply.prototype = {


    generateUniformsApplyMethods: function () {

        var functionStr = [ '//generated by RenderLeaf\n' ];
        functionStr.push( 'var gl = state.getGraphicContext();' );
        functionStr.push( 'var matrixModelViewChanged = state.applyModelViewMatrix( modelview );' );
        functionStr.push( 'state.applyProjectionMatrix( projection );' );

        if ( this.modelWorldUniform !== undefined ) {
            functionStr.push( 'if ( matrixModelViewChanged ) {' );
            functionStr.push( '    var modelWorldMatrix = state.modelWorldMatrix;' );
            functionStr.push( '    modelWorldMatrix.setMatrix4( modelworld );' );
            functionStr.push( '    modelWorldMatrix.apply( gl, this.modelWorldUniform);' );
            functionStr.push( '};' );
        }

        if ( this.viewUniform !== undefined ) {
            functionStr.push( 'if ( matrixModelViewChanged ) {' );
            functionStr.push( '    var viewMatrix = state.viewMatrix;' );
            functionStr.push( '    viewMatrix.setMatrix4( view );' );
            functionStr.push( '    viewMatrix.apply( gl, this.viewUniform);' );
            functionStr.push( '};' );
        }

        // I am the evil, so please bother someone else
        /*jshint evil: true */
        // name the function
        // http://stackoverflow.com/questions/5905492/dynamic-function-name-in-javascript
        var func = ( new Function( 'state', 'modelview', 'modelworld', 'view', 'projection', 'return function RenderLeafApplyMatrixUniformCache( state, modelview, modelworld, view, projection ) { ' + functionStr.join( '\n' ) + '}' ) )();
        /*jshint evil: false */

        this.apply = func;
    }
};


var RenderLeaf = function () {

    this._parent = undefined;
    this._geometry = undefined;
    this._depth = 0.0;

    this._projection = undefined;
    this._view = undefined;
    this._modelWorld = undefined;
    this._modelView = undefined;
};

RenderLeaf.prototype = {

    reset: function () {
        this._parent = undefined;
        this._geometry = undefined;
        this._depth = 0.0;

        this._projection = undefined;
        this._view = undefined;
        this._modelWorld = undefined;
        this._modelView = undefined;
    },

    init: function ( parent, geom, projection, view, modelView, modelWorld, depth ) {

        this._parent = parent;
        this._geometry = geom;
        this._depth = depth;

        this._projection = projection;
        this._view = view;
        this._modelWorld = modelWorld;
        this._modelView = modelView;

    },

    drawGeometry: ( function () {

        return function ( state ) {

            var program = state.getLastProgramApplied();
            var programInstanceID = program.getInstanceID();
            var cache = state.getCacheUniformsApplyRenderLeaf();
            var obj = cache[ programInstanceID ];

            if ( !obj ) {
                obj = new CacheUniformApply( state, program );
                cache[ programInstanceID ] = obj;
            }

            obj.apply( state, this._modelView, this._modelWorld, this._view, this._projection, this._normal );

            this._geometry.drawImplementation( state );

        };
    } )(),

    render: ( function () {
        var previousHash;

        return function ( state, previousLeaf ) {

            var prevRenderGraph;
            var prevRenderGraphParent;
            var curRenderGraph = this._parent;
            var curRenderGraphParent = curRenderGraph.parent;
            var curRenderGraphStateSet = curRenderGraph.stateset;

            // When rendering a RenderLeaf we try to limit the state change
            // to do that Graph of State is created during the culling pass.
            // this graph contains nodes of StateGraph type see the class StateGraph
            //
            // So to limit switching of StateSet we check where are the common parent
            // between previous RenderLeaf and this current.
            //
            // There are 3 cases when there is a prev / current render leaf
            //
            //
            // pRG: previousRenderGraph
            // cRG: currentRenderGraph
            // pRL: previousRenderLeaf
            // cRL: currentRenderLeaf
            // each RG contains a StateSet
            //
            //          A                        B                       C
            // +-----+     +-----+            +-----+                 +-----+
            // | pRG |     | cRG |         +--+ RG  +--+              | RG  |
            // +--+--+     +--+--+         |  +-----+  |              +--+--+
            //    |           |            |           |                 |
            // +--v--+     +--v--+      +--v--+     +--v--+           +--v--+
            // | pRG |     | cRG |      | pRG |     | cRG |        +--+ RG  +--+
            // +--+--+     +--+--+      +--+--+     +--+--+        |  +-----+  |
            //    |           |            |           |           |           |
            // +--v--+     +--v--+      +--v--+     +--v--+     +--v--+     +--v--+
            // | pRL |     | cRL |      | pRL |     | cRL |     | pRL |     | cRL |
            // +-----+     +-----+      +-----+     +-----+     +-----+     +-----+
            //
            //
            // Case A
            // no common parent StateGraphNode we need to
            // popStateSet until we find the common parent and then
            // pushStateSet from the common parent to the current
            // RenderLeaf
            //
            // Case B
            // common parent StateGraphNode so we apply the current stateSet
            //
            // Case C
            // the StateGraphNode is common to the previous RenderLeaf so we dont need
            // to do anything except if we used an insertStateSet
            //

            if ( previousLeaf !== undefined ) {

                // apply state if required.
                prevRenderGraph = previousLeaf._parent;
                prevRenderGraphParent = prevRenderGraph.parent;

                if ( prevRenderGraphParent !== curRenderGraphParent ) {

                    // Case A
                    StateGraph.moveStateGraph( state, prevRenderGraphParent, curRenderGraphParent );

                    state.applyStateSet( curRenderGraphStateSet );
                    previousHash = state.getStateSetStackHash();

                } else if ( curRenderGraph !== prevRenderGraph ) {

                    // Case B
                    state.applyStateSet( curRenderGraphStateSet );
                    previousHash = state.getStateSetStackHash();

                } else {

                    // Case C

                    // in osg we call apply but actually we dont need
                    // except if the stateSetStack changed.
                    // for example if insert/remove StateSet has been used
                    var hash = state.getStateSetStackHash();
                    if ( previousHash !== hash ) {
                        state.applyStateSet( curRenderGraphStateSet );
                        previousHash = hash;
                    }
                }

            } else {

                StateGraph.moveStateGraph( state, undefined, curRenderGraphParent );
                state.applyStateSet( curRenderGraphStateSet );
                previousHash = state.getStateSetStackHash();
            }

            this.drawGeometry( state );

        };
    } )()

};

module.exports = RenderLeaf;
