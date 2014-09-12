/// <reference path="pubnub_chess.js" />
/*
 * 3D Artwig chess set
 * @JulianGarnier
 *
 * Licensed under the MIT license.
 * Copyright 2012 Julian Garnier

 * Modifications made by Android Technologies, Inc. (Look for comments that start with the ATI: prefix to see changes).  Note,
 *  I only added comments to the parts of the code I needed to modify or understand..  
 */

// This is the un-minified source for ches_scripts.min.js

var chess = new Chess();
var currentColor = chess.turn();
var turn = 0;
var timeOut = null;
var photon = document.getElementsByClassName("photon-shader");
var sphere = document.getElementsByClassName("sphere");
var piece = document.getElementsByClassName("piece");
var square = document.getElementsByClassName("square");
var app = document.getElementById("app");
var scene = document.getElementById("scene");
var sceneX = 70;
var sceneY = 90;
var controls = false;
var animated = false;
var mouseDown = false;
var closestElement = null;
var white = "White";
var black = "Black";

// Set this TRUE to show verbose comments in the console during game play.
var g_debug = true;

// 09-02-2014, ATI: If this variabe is not NULL, then the drop piece method will call this method
//  with the last move made on the board in "pretty" format.
var gPostDropPieceMethod = null;

// ATI: Simple array to help "flip" the alphabetical portion of a square ID in algebraic
//  chess notation.
var aryTranslateLetters = new Array(8);

aryTranslateLetters['a'] = 'h';
aryTranslateLetters['b'] = 'g';
aryTranslateLetters['c'] = 'f';
aryTranslateLetters['d'] = 'e';
aryTranslateLetters['e'] = 'd';
aryTranslateLetters['f'] = 'c';
aryTranslateLetters['g'] = 'b';
aryTranslateLetters['h'] = 'a';

// Given a square ID in algebraic chess notation, translate it to the square it would overlap
//  if the board was rotated 180 degrees.
function translateSquareID(squareID)
{
    if (typeof squareID == "undefined" || squareID == null)
        throw new Error("(translateSquareID) The square ID to translate is unassigned.");

    if (squareID.length != 2)
        throw new Error("(translateSquareID) Invalid square ID (string length): " + squareID);

    // Break apart the coordinates.
    var letter = squareID.substr(0, 1);
    var number = parseInt(squareID.substr(1, 1));

    if (number == NaN)
        throw new Error("(translateSquareID) Invalid square ID (invalid numeric portion, not a number): " + squareID);

    // Translate the letter using our translation array.
    var letter2 = aryTranslateLetters[letter];
    
    if (typeof letter2 == "undefined" || letter2 == null)
        throw new Error("(translateSquareID) The square ID to translate is unassigned.");

    // Translate the number by flipping it numerically around the center value for its range.
    var number2 = (8 - number) + 1;

    if (number2 < 1 || number2 > 8)
        throw new Error("(translateSquareID) Invalid square ID (invalid numeric portion, out of range): " + squareID);

    // Make the new ID and return.
    return letter2 + number2;
}

// Update's the screen element that shows whose turn it currently is in the game.
function updateTurnElement()
{
    var strMySide = g_chess_side == "w" ? "White" : "Black";
    var strWhoseTurn = isItMyTurn() ? "your" : "your opponent's"

    $("#whose_turn").text("It is " + strWhoseTurn + " turn.  You are playing " + strMySide);
}

function checkTouch() {
  var d = document.createElement("div");
  d.setAttribute("ontouchmove", "return;");
  return typeof d.ontouchmove === "function" ? true : false;
}

if(checkTouch()) {
  var press = "touchstart";
  var drag = "touchmove";
  var drop = "touchend";
} else {
  var press = "mousedown";
  var drag = "mousemove";
  var drop = "mouseup";
}

function initControls() {
  for(var i=0; i<piece.length; i++) { 
    piece[i].addEventListener(press, grabPiece, false);
  }
  app.addEventListener(drag, dragPiece, false);
  app.addEventListener(drop, dropPiece, false);
  app.addEventListener(drag, moveScene, false);
  app.onselectstart = function(event) { event.preventDefault(); }
  app.ontouchmove = function(event) { event.preventDefault(); }
}

// ATI: Guts of the grabPiece() event listener method so that others may call it.
//
// NOTE: "grabbed" is the DIV that contains the grabbed piece and it's component DIVs.  The
//  ID of the DIV is set to the grabbed piece occupying the given square using a 4-letter
//  system.  For example "wpe4" is the white pawn currently sitting in the "e4" square:
//
//    w   : white
//    p   : pawn
//    e4  : Column "e" and row 4 using the algebraic notation for chess.
//
// grabbedPiece : The square containing the grabbed piece.
// pageX        : The starting X location of the grab.
// pageY        : The starting Y location of the grab.
function doGrabPiece(grabbedPiece, pageX, pageY)
{
    // Update the variable that tracks the currently grabbed piece.
    grabbed = grabbedPiece;

    if (typeof grabbed == "undefined" || grabbed == null)
    {
        throw new Error("(doGrabPiece) The grabbed is unassigned.");
        return;
    }

    if (typeof pageX == "undefined" || pageX == null)
    {
        throw new Error("(doGrabPiece) The starting X location is unassigned.");
        return;
    }

    if (typeof pageY == "undefined" || pageY == null)
    {
        throw new Error("(doGrabPiece) The starting Y location is unassigned.");
        return;
    }

    grabbedID = grabbed.id.substr(-2);
    startX = pageX - (document.body.offsetWidth / 2);
    startY = pageY - (document.body.offsetHeight / 2);

    style = window.getComputedStyle(grabbed);
    matrix = style.getPropertyValue('-webkit-transform');
    matrixParts = matrix.split(",");

    grabbedW = parseInt(style.getPropertyValue('width')) / 2;
    grabbedX = parseInt(matrixParts[4]);
    grabbedY = parseInt(matrixParts[5]);
    grabbed.classList.add("grabbed");

    // Show the moves that are valid for this piece.
    showMoves(grabbedID);

    // Highlight the squares that are valid move destinations.
    highLight(grabbed, square);

    if (g_debug)
    {
        console.log("---------------- BEGIN: doGrabPiece() --------------");
        console.log("startX: " + startX);
        console.log("startY: " + startY);

        console.log("grabbedW: " + grabbedW);
        console.log("grabbedX: " + grabbedX);
        console.log("grabbedY: " + grabbedY);
        console.log("Current turn: " + chess.turn())
        console.log("---------------- END: doGrabPiece() --------------");
    }

}

// ATI: This event fires when a piece is grabbed.
function grabPiece(event)
{
    if (!mouseDown && controls)
    {
        event.preventDefault();

        // ATI: Abort the move if it is not our turn.  
        if (!isItMyTurn())
        {
            alert("Please wait for your opponent to make their move.");
            return;
        }

        mouseDown = true;


        // The "this" object is a piece-containing DIV.
        doGrabPiece(this, event.pageX, event.pageY);
    }
}

// ATI: Guts of the dragPiece() event listener method so that others may call it.
//
//  moveToX: desired X location of the element being dragged.
//  moveToY: desired Y location of the element being dragged.
//
// REMARKS: As the piece is dragged the closest square to it is highlighted.  This is
//  an important side effect that the dropPiece() method is dependent on, since
//  it uses the closest square as the destination square.
function doDragPiece(moveToX, moveToY)
{
    if (typeof moveToX == "undefined" || moveToX == null)
    {
        throw new Error("(doDragPiece) The element X value is unassigned.");
        return;
    }

    if (typeof moveToY == "undefined" || moveToY == null)
    {
        throw new Errorlog("(doDragPiece) The element X value is unassigned.");
        return;
    }

    var distX = moveToX - startX;
    var distY = moveToY - startY;

    // ATI: We change the orientation of movement based on what side the local user is playing now.
    //   Before we disabled board spinning, it was based on whose turn it is.
    // if (currentColor === "w")
    if (g_chess_side === "w")
    {
        newX = grabbedX + distX;
        newY = grabbedY + distY;
    }
    else
    {
        newX = -(grabbedX + distX);
        newY = -(grabbedY + distY);
    }

    grabbed.style.webkitTransform = "translateX(" + newX + "px) translateY(" + newY + "px) translateZ(2px)";

    highLight(grabbed, square);

    if (g_debug)
    {
        console.log("---------------- BEGIN: doDragPiece() --------------");

        console.log("startX: " + startX);
        console.log("startY: " + startY);

        console.log("moveToX: " + moveToX);
        console.log("moveToY: " + moveToY);

        console.log("distX: " + distX);
        console.log("distY: " + distY);

        console.log("grabbedX: " + grabbedX);
        console.log("grabbedY: " + grabbedY);

        console.log("newX: " + newX);
        console.log("newY: " + newY);
        console.log("Current turn: " + chess.turn())

        console.log("---------------- END: doDragPiece() --------------");
    }
}

// ATI: This event fires when a grabbed piece is dragged.
function dragPiece(event) {
  if (mouseDown && controls) {
      event.preventDefault();

    // ATI: Get the current drag location.
    var moveX = event.pageX - (document.body.offsetWidth / 2);
    var moveY = event.pageY - (document.body.offsetHeight / 2);

    doDragPiece(moveX, moveY);
  }
}

// ATI: Guts of the doDropPiece() event listener method so that others may call it.
//
function doDropPiece()
{
    var squareEndPos = closestElement.id;
    var grabbedID2 = grabbedID;

    function getMove(moveType) {
        return document.getElementById(squareEndPos).className.match(new RegExp('(\\s|^)' + moveType + '(\\s|$)'));
    }

    // Extract the move type so we know how to render the target square.
    if (getMove("valid")) {
        if (getMove("captured")) {
            var type = chess.get(squareEndPos).type;
            var color = chess.get(squareEndPos).color;

            if (currentColor === "w") {
                createPiece(color, type, "w-jail");
            }
            else {
                createPiece(color, type, "b-jail");
            }
        }

        // ATI: Unhighlight the squares we highlighted to show the user the valid destination squares for the
        //  grabbed piece.
        hideMoves(grabbedID2);

        // ATI: Previous code.
        // chess.move({ from: grabbedID, to: squareEndPos, promotion: 'q' });

        // ATI: Store the "prettified" move-made object returned from the chess.move() method in a variable.
        var prettyMove = chess.move({ from: grabbedID2, to: squareEndPos, promotion: 'q' });

        // ATI: If a post drop piece method was provided by code loaded after us, then call that
        //  method know with the latest move.
        if (gPostDropPieceMethod != null) {
            // ATI: Publish this new movement to the opponent ONLY if the player color in the movement
            //  matches the the color of the current user.  Otherwise the movement belongs to the opponent and
            //  we currently animating it for the current user and we don't want to generate a vicious circle
            //  of publishing the same movement repeatedly between the players.
            if (prettyMove.color === currentColor)
                // It's a move by the current user.  Publish it to the opponent.
                gPostDropPieceMethod(prettyMove);
        }

    }
    else {
        hideMoves(grabbedID2);
        grabbed.style.webkitTransform = "translateX(0px) translateY(0px) translateZ(2px)";
    }

    updateBoard();
    grabbed.classList.remove("grabbed");

    if (g_debug)
    {
        console.log("---------------- BEGIN: doDropPiece() --------------");

        console.log("startX: " + startX);
        console.log("startY: " + startY);

        console.log("grabbedX: " + grabbedX);
        console.log("grabbedY: " + grabbedY);

        console.log("newX: " + newX);
        console.log("newY: " + newY);

        console.log("closestElement.id: " + closestElement.id);
        console.log("Current turn: " + chess.turn())
        console.log("---------------- END: doDropPiece() --------------");
    }
}

// 09-02-2014 ATI: See doDropPiece() above.
//
// This event fires when a grabbed piece is dropped onto the board, completing a move.
function dropPiece(event)
{
  if (mouseDown && controls)
  {
    event.preventDefault();

    doDropPiece();

    mouseDown = false;
  }
}

function moveScene(event) {
  if (animated) {
    eventStartX = event.pageX - (document.body.offsetWidth/2);
    eventStartY = event.pageY - (document.body.offsetHeight/2);
  }
  eventStartX = 0;
  eventStartY = 0;
  if (!controls && !animated) {
    document.body.classList.remove("animated");
    event.preventDefault();
    eventMoveX = event.pageX - (document.body.offsetWidth/2);
    eventDistX = (eventMoveX - eventStartX);
    eventMoveY = event.pageY - (document.body.offsetHeight/2);
    eventDistY = (eventMoveY - eventStartY);
    eventX = sceneY - (eventDistX*-.03);
    eventY = sceneX - (eventDistY*-.03);
    scene.style.webkitTransform = 'RotateX('+ eventY + 'deg) RotateZ('+ eventX + 'deg)';
    for(var i=0; i<sphere.length; i++) {
      updateSphere(sphere[i],eventY,eventX);
    }
  }
}

function showMoves(Target) {
  var validMoves = chess.moves({ target: Target, verbose: true });
  for(var i=0; i<validMoves.length; i++) {
    var validMove = validMoves[i];
    var from = validMove.from;
    var to = validMove.to;
    var captured = validMove.captured;
    document.getElementById(from).classList.add("current");
    document.getElementById(to).classList.add("valid");
    if (captured) { document.getElementById(to).classList.add("captured"); }
  }
}

function hideMoves(Target) {
  var validMoves = chess.moves({ target: Target, verbose: true });
  for(var i=0; i<validMoves.length; i++) {
    var validMove = validMoves[i];
    var from = validMove.from;
    var to = validMove.to;
    document.getElementById(from).classList.remove("current");
    document.getElementById(to).classList.remove("valid");
    document.getElementById(to).classList.remove("captured");
  }
}

function createPiece(color, piece, position) {
  var clone = document.getElementById(piece).cloneNode(true);
  clone.addEventListener(press, grabPiece, false);
  clone.setAttribute("id",color+piece+position);
  if ( color === "w" ) { clone.classList.add("white"); } 
  else { clone.classList.add("black"); }
  document.getElementById(position).appendChild(clone);
}

function updateBoard() {
  var updateTiles = {};
  var inCheck = chess.in_check();
  var inCheckmate = chess.in_checkmate();
  var inDraw = chess.in_draw();
  var inStalemate = chess.in_stalemate();
  var inThreefold = chess.in_threefold_repetition();
  chess.SQUARES.forEach(function(tile) {
    var boardS = board[tile];
    var chessS = chess.get(tile);
    if (boardS && chessS) {
      if (boardS.type !== chessS.type || boardS.color !== chessS.color) {
        updateTiles[tile] = chessS;   
      }
    } else if (boardS || chessS) {
      updateTiles[tile] = chessS;
    }
    board[tile] = chessS;
  });
  for (var id in updateTiles) {
    var titleID = document.getElementById([id]);
    if (updateTiles[id] === null) {
      titleID.innerHTML = "";
    } else {
      var color = updateTiles[id].color;
      var piece = updateTiles[id].type;
      var symbol = color + piece;
      if ( currentColor === color && !titleID.hasChildNodes()) {
        createPiece(color, piece, [id]);
      } else {
        titleID.innerHTML = "";
        createPiece(color, piece, [id]);
      }
    }
  }
  var fen = chess.fen();
  currentColor = chess.turn();
  function Log(message) {
    document.getElementById("log").innerHTML = message;
  }
  if (fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
    document.getElementById("undo").dataset.state="active";
  } else {
    document.getElementById("undo").dataset.state="inactive";
  }
  if (currentColor === "w")
  {
    // ATI: Disable board spinning with each turn.
    // updateView(0,0);
    Log(white+"'s turn");
    if (inCheck) { 
      Log(white+"'s king is in check !");
    }
    if (inCheckmate) { 
      Log(white+"'s king is in checkmate ! "+black+" wins !");
    }
  } else {
    // ATI: Disable board spinning with each turn.
    // updateView(0, 180);
    Log(black+"'s turn");
    if (inCheck) { 
      Log(black+"'s king is in check !");
    }
    if (inCheckmate) { 
      Log(black+"'s king is in checkmate ! "+white+" wins");
    }
  }

  // ATI: Update our element that shows whose turn it is.
  updateTurnElement();
}

function updateCaptured() {
  var wbPiece  = document.getElementById("board").getElementsByClassName("white");
  var bbPiece  = document.getElementById("board").getElementsByClassName("black");
  var wjPiece  = document.getElementById("w-jail").getElementsByClassName("black");
  var bjPiece  = document.getElementById("b-jail").getElementsByClassName("white");
  if (wbPiece.length+bjPiece.length !== 16) {
    var child = document.getElementById("b-jail").lastChild;
    document.getElementById("b-jail").removeChild(child);
  }
  if (bbPiece.length+wjPiece.length !== 16) {
    var child = document.getElementById("w-jail").lastChild;
    document.getElementById("w-jail").removeChild(child);
  }
}

function undoMove() {
  chess.undo();
  updateBoard();
  updateCaptured();
}

// ATI: Highlight the closest square to the given element.  Unhighlight all others.
function highLight(element, squaresCollection)
{

  function winPos(obj) {
    var box = obj.getBoundingClientRect();
    return {
      x : box.left,
      y : box.top
    }
  }

  var elementLeft = winPos(element).x + grabbedW;
      elementRight = elementLeft + element.offsetWidth - grabbedW,
      elementTop = winPos(element).y + grabbedW,
      elementBottom = elementTop + element.offsetHeight - grabbedW,
      smallestDistance = null;

  for (var i = 0; i < squaresCollection.length; i++)
  {

    // ATI: Adjust the calculations based on whether or not the current color sees the
    //  board in the normal or rotated view.
    // if (currentColor === "w")
    if (g_chess_side === "w")
    {
      var squareLeft = winPos(squaresCollection[i]).x,
          squareRight = squareLeft + squaresCollection[i].offsetWidth,
          squareTop = winPos(squaresCollection[i]).y,
          squareBottom = squareTop + squaresCollection[i].offsetHeight;
    }
    else
    {
      var squareLeft = winPos(squaresCollection[i]).x + grabbedW,
          squareRight = squareLeft + squaresCollection[i].offsetWidth,
          squareTop = winPos(squaresCollection[i]).y + grabbedW,
          squareBottom = squareTop + squaresCollection[i].offsetHeight;
    }

    var xPosition = 0,
        yPosition = 0;

    if(squareRight < elementLeft) {
      xPosition = elementLeft - squareRight;
    } else if(squareLeft > elementRight) {
      xPosition = squareLeft - elementRight;
    }
    if(squareBottom < elementTop) {
      yPosition = elementTop - squareBottom;
    } else if(squareTop > elementBottom) {
      yPosition = squareTop - elementBottom;
    }
    var valueForComparison = 0;
    if(xPosition > yPosition) {
      valueForComparison = xPosition;
    } else {
      valueForComparison = yPosition;
    }
    if(smallestDistance === null) {
      smallestDistance = valueForComparison;
      closestElement = squaresCollection[i];
    } else if(valueForComparison < smallestDistance) {
      smallestDistance = valueForComparison;
      closestElement = squaresCollection[i];
    }
  }

  // ATI: Unhighlight all squares.
  for(var i = 0; i < squaresCollection.length; i++) {
    squaresCollection[i].classList.remove("highlight");
  }

  // ATI: Highlight the squaresCollection element closest to the element.
  closestElement.classList.add("highlight");

  targetX = closestElement.offsetLeft;
  targetY = closestElement.offsetTop;

}

function updateView(sceneXAngle,sceneZAngle) {
  scene.style.webkitTransform = "rotateX( " + sceneXAngle + "deg) rotateZ( " + sceneZAngle + "deg)";
  for(var i=0; i<sphere.length; i++) {
    updateSphere(sphere[i],sceneXAngle,sceneZAngle);
  }
}

function updateSphere(sphere,sceneXAngle,sceneZAngle) {
  sphere.style.WebkitTransform = "rotateZ( " + ( - sceneZAngle ) + "deg ) rotateX( " + ( - sceneXAngle ) + "deg )";
}

function renderPoly() {
  var light = new Photon.Light( x = 50, y = 150, z = 250);
  var shadeAmount = 1;
  var tintAmount = 1;
  var pieces = new Photon.FaceGroup($("#container")[0], $("#container .face"), 1.6, .48, true);
  pieces.render(light, true);
}

function resetPoly() {
  for(var i = 0; i < photon.length; i++) {
    photon[i].setAttribute("style","");
  }
  if(timeOut != null) clearTimeout(timeOut);
  timeOut = setTimeout(renderPoly, 250);
}

// ATI: Since we disabled the board spinning between turns feature, it is necessary
//  to turn the board once if the current side is black.
function Continue() {
    updateBoard();

    if (g_chess_side == "b")
        // Spin the board 180 degrees if the local user is playing Black.
        updateView(0, 180)
    else
        // Spin the board to 0 degrees if the local user is playing White.
        updateView(0, 0)

  controls = true;
  animated = true;
  document.getElementById("app").dataset.state="game";
  document.body.classList.add("animated");
}

function optionScreen() {
  updateView(sceneX,sceneY);
  controls = false;
  document.getElementById("app").dataset.state="menu";
  function setAnimated() { animated = false; }
  setTimeout(setAnimated, 2500);
}

function toggleFrame(event) {
  if (event.checked) {
    document.getElementById("app").dataset.frame="on";
  } else {
    document.getElementById("app").dataset.frame="off";
  }
  resetPoly();
}

function setState(event) {
  event.preventDefault();
  var data = this.dataset.menu;
  document.getElementById("app").dataset.menu=data;
}

function setTheme(event) {
  event.preventDefault();
  var data = this.dataset.theme;
  document.getElementById("app").dataset.theme=data;
  if (data === "classic" || data === "marble" ) { white = "White", black = "Black" }
  else if (data === "flat" || data === "wireframe" ) { white = "Blue", black = "Red" }
}

function UI() {
  var menuBtns = document.getElementsByClassName("menu-nav");
  var themeBtns = document.getElementsByClassName("set-theme");
  for(var i=0; i<menuBtns.length; i++) {
    menuBtns[i].addEventListener(press, setState, false);
  }
  for(var i=0; i<themeBtns.length; i++) {
    themeBtns[i].addEventListener(press, setTheme, false);
  }
  document.getElementById("continue").addEventListener(press, Continue, false);
  document.getElementById("open-menu").addEventListener(press, optionScreen, false);
  document.getElementById("undo").addEventListener(press, undoMove, false);
}

function init() {
  app.classList.remove("loading");
  document.body.classList.add("animated");
  animated = true;
  updateBoard();
  optionScreen();
  initControls();
  UI();
  function anime() { document.getElementById("logo").innerHTML = ""; }
  setTimeout(anime, 2000);
}

window.addEventListener("resize", resetPoly, false);

var readyStateCheckInterval = setInterval(function() {
  if (document.readyState === "complete") {
    renderPoly();
    init();
    clearInterval(readyStateCheckInterval);
  }
}, 3250);