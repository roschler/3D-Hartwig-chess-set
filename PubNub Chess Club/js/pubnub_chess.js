/// <reference path="common.js" />
/// <reference path="chess_app.js" />


/*
    FILE: pubnub_chess.js

    PubNub related code for managing the link between to chess players playing chess via the chess.html web page.

    (c) 2014 Android Technologies, Inc.

    Published under the MIT license

    NOTE!: This code must be loaded AFTER the chess code so we can fill in that code's gPostDropPiece variable with
        a call to our postDropPiece(). 

    NOTE!: The pieces are represented by DIVs, but a square that does not have a piece in it is only a table data
     element (TD).
*/

// The chat related HTML elements.
var $chat_form = null;
var $output = null;
var $input = null;

// See the App object for an explanation of these three global variables.
var g_local_uuid = null;
var g_remote_uuid = null;
var g_pubnub_chess_channel = null;
var g_local_skill_level = null;

// What side the current user is, "b" or "w" (White or Black).
var g_chess_side = null;

// The URL arguments passed to us.
var g_url_arguments = null;

// Set to TRUE when we are in the middle of animating the opponent's last move.  Set to FALSE
//  when we are done or haven't begun one yet.
var g_is_animating_chess_move = false;

// The interval timer object for doAnimateChessMoveTimer().
var g_do_animate_chess_move_timer = null;

// The object that controls the animation of a chess piece (moving it).
var g_animation_controller = null;

// Whose turn it is, "black" or "white"'s, initialized to "white".
// var chess_turn = "white";
// SEE chess.turn()

// Returns TRUE if it is the current user's turn to make a move, FALSE if not indicating
//  it's the remote user's turn.
function isItMyTurn()
{
    return g_chess_side == chess.turn();
}

// Call this function from the window.onbeforeunload() event to make sure we unsubscribe from any PubNub
//  channels before leaving the web page.
function leavePage()
{
    if (typeof pubnub != "undefined" && pubnub != null)
    {
        pubnub.unsubscribe({
            channel: g_pubnub_chess_channel,
        });
    }
}


// Publish a chess move to the opponent.
//  
//  prettyMove: A chess.js chess move in "pretty" format:
//
// EXAMPLE of a prettified "move": Object
//
//          color   : "w"
//          flags   : "b"
//          from    : "d2"
//          piece   : "p"
//          san     : "d4"
//          to      : "d4"
//
// EXPLAINED: Move the white pawn from "d2" to "d4".
//
//      http://en.wikipedia.org/wiki/Algebraic_notation_(chess)
//
// 
function publishChessMove(prettyMove)
{
    if (typeof prettyMove == "undefined" || prettyMove == null)
    {
        throw new Error("(publishChessMove) The chess move object is unassigned.");
        return;
    }

    pubnub.publish({
        channel: g_pubnub_chess_channel,
        message: {
            // The type of message we're sending, a chess mvoe.
            type: 'chess_move',
            // The chess move just maded in chess.js "pretty" format.
            move: prettyMove,
            // Our user ID.
            src_uuid: g_local_uuid,
            // Our opponent's ID.
            target_uuid: g_remote_uuid
        }
    });

}

// Build the DIV ID for the square that should contain the piece that is to be
//  moved.  That is, the From square that is encoded in the "prettified" move.
//
// FORMAT: color id + piece id + current square id in chess algebraic notation. 
//
// REMARKS: For example, "wpc2" is a white pawn in square c2.
function prettyMove_To_FromDivId(prettyMove)
{
    if (typeof prettyMove == "undefined" || prettyMove == null)
        throw new Error("(prettyMove_To_FromDivId) The chess move object is unassigned.");

    // See the publishChessMove() notes for details on the "prettified" chess move format.
    return prettyMove.color + prettyMove.piece + prettyMove.from;
}

// Returns a fully initialized animation controller object using the given parameters.
//
//  fromSquare  : The starting square of the chess move. (DIV in Jquery element format).
//  toSquare    : The ending square of the chess move. (DIV in Jquery element format).
//  deltaX      : How many pixels in the X direction to move the grabbed piece each invocation of the timer interval (see doAnimateChesslMove() ).
//  deltaY      : Same as deltaX except for the Y direction.
function makeAnimationController(fromSquare, toSquare, deltaX, deltaY)
{
    if (typeof fromSquare == "undefined" || fromSquare == null)
        throw new Error("(animationController) The animation controller object is unassigned.");

    if (typeof toSquare == "undefined" || toSquare == null)
        throw new Error("(animationController) The animation controller object is unassigned.");

    if (typeof deltaX == "undefined" || deltaX == null)
        throw new Error("(animationController) The X direction movement increment is unassigned.");

    if (typeof deltaY == "undefined" || deltaY == null)
        throw new Error("(animationController) The Y direction movement increment is unassigned.");

    // The deltaX and deltaY values can't both be 0 or nothing will move during the animation.
    if (deltaX == 0 && deltaY == 0)
        throw new Error("(animationController) The X and Y direction movement increments are both 0.");

    // Initialize the current location to the center of the From square's location.  We use
    //  absolute coordinates because that's what the chess_app.js code expects.
    var currentLocXY = centerOfElementRelative(fromSquare.id);

    // Get the DIV that contains the piece to move.  In reality that equates to the fromSquare DIV.
    var grabbedPieceLocal = fromSquare;

    // Return the fully built JSON object.
    return {
            // Initialize the first-invocation flag to TRUE.
            is_first_invocation : true,
            currentLocXY        : currentLocXY,
            // The destination point is the center of the To square, the square that we
            //  are moving the chess piece to.
            destLocXY           : centerOfElementRelative(toSquare.id),
            deltaX              : deltaX,
            deltaY: deltaY,
            grabbedPiece        : grabbedPieceLocal
        };
}

// Stops the animation of a a chess move and cleans up too.
function stopAnimating()
{
    // Clear the is-animating flag.
    g_is_animating_chess_move = false;

    // Stop the interval timer.
    clearInterval(g_do_animate_chess_move_timer);
    g_do_animate_chess_move_timer = null;
}

// This function is invoked on an interval timer and animates the moving of the piece as
//  prescribed by the given animationController object.
function doAnimateChessMoveTimer()
{
    if (typeof g_animation_controller == "undefined" || g_animation_controller == null)
        throw new Error("(doAnimateChessMoveTimer) The animation controller object is unassigned.");

    try
    {
        // Is it the first-invocation of this method?
        if (g_animation_controller.is_first_invocation)
        {
            g_animation_controller.currentLocXY.x,
            g_animation_controller.currentLocXY.y;

            // doGrabPiece() expects absolute coordinates for the starting X and Y since it
            //  expects the values to come from a a mouse move event.  Convert the relative
            //  coordinates in the animation controller's currentLocXY member to absolute
            //  coordinates.
            var tempPageX = g_animation_controller.currentLocXY.x + (document.body.offsetWidth / 2);
            var tempPageY = g_animation_controller.currentLocXY.y + (document.body.offsetHeight / 2);

            // "Grab" the piece to start the chess move animation.  
            doGrabPiece(
                g_animation_controller.grabbedPiece,
                tempPageX,
                tempPageY);

            // Clear the first-invocation flag.
            g_animation_controller.is_first_invocation = false;
        }
        else 
        {
            // If we are within 10 pixels of the center of the destination square then consider
            //  the move completed and "drop" the piece.
            //
            // Determine the distance of the piece from the destination square's center.
            var distX = Math.abs(g_animation_controller.destLocXY.x - g_animation_controller.currentLocXY.x);
            var distY = Math.abs(g_animation_controller.destLocXY.y - g_animation_controller.currentLocXY.y);

            var distFromDest = Math.sqrt(distX * distX + distY * distY);

            var is_animation_finished = distFromDest <= 10;

            if (is_animation_finished)
            {
                // Drop the piece, we're done.
                doDropPiece();

                // Stop animating.
                stopAnimating();
            }
            else
            {
                // Not done yet.  Update the current location fields in the animation controller using the controller's
                //  X and Y movement increment values and then move the piece there.
                g_animation_controller.currentLocXY.x += g_animation_controller.deltaX;
                g_animation_controller.currentLocXY.y += g_animation_controller.deltaY;

                doDragPiece(g_animation_controller.currentLocXY.x, g_animation_controller.currentLocXY.y);
            }
        }
    }
    catch (e)
    {
        // Stop animating, something went wrong.
        stopAnimating();

        throw new Error("An exception occurred during doAnimateChessMoveTimer: " + e.message);
    }
}

// Finds the square that has the endsWithStr string at the end of it's element ID.
function findDestinationSquare(endsWithStr)
{
    // Look for a piece (DIV) that has endsWithStr at the end of its ID, in case the current
    //  chess move is a capture operation.
    var destElem = findDivByEndsWithID(endsWithStr);

    if (typeof destElem == "undefined" || destElem == null)
    {
        // Not found.  Now check for an empty square that has the endsWithStr at the end of
        //  its ID.  Empty squares are table data elements (TD).
        destElem = findTdByEndsWithID(endsWithStr);
    }
    
    return destElem;
}

// Given a "prettified" chess move made by the current user's opponent and sent to us 
//  via PubNub, animate the move  as if it was made locally and thereby execute it as well.
// 
// RETURNS: TRUE if the move succeeded, FALSE if not.
function animateChessMove(prettyMove)
{
    g_is_animating_chess_move = true;

    try
    {
        // Make sure the piece being moved is where the given move "thinks" it is.

        // Build the DIV ID for the square that should contain the piece being moved right now
        //  from the given chess mvoe.
        var fromSquareID = prettyMove_To_FromDivId(prettyMove);

        // Make sure the square exists.  We use findDestinationSquare() even though we are looking
        //  for an exact match to take care of it's JQuery element resolution code.
        var fromSquare = findDestinationSquare(fromSquareID);

        if (typeof fromSquare == "undefined" || fromSquare == null)
            throw new Error("Unable to find a source square on the board with the ID(" + fromSquareID + ")");

        // Find the destination square.
        var toSquare = findDestinationSquare(prettyMove.to);

        if (typeof toSquare == "undefined" || toSquare == null)
            throw new Error("Unable to find a destination square on the board with the ID(" + toSquareID + ")");

        // Calculate the X and Y distance between the From and the To squares (source & destination).
        var fromCenter = centerOfElementRelative(fromSquare.id);
        var toCenter = centerOfElementRelative(toSquare.id);

        var distX = toCenter.x - fromCenter.x;
        var distY = toCenter.y - fromCenter.y;

        // Determine the delta X and delta Y values that will move the piece from the From to the To square
        //  in 1 second, in 100 millisecond increments (in 10 movements).
        var deltaX = distX / 10;
        var deltaY = distY / 10;

        // Create an animation controller object to control this animation.
        g_animation_controller = makeAnimationController(fromSquare, toSquare, deltaX, deltaY);

        // Start the interval function that will animate the chess move.
        g_do_animate_chess_move_timer = setInterval("doAnimateChessMoveTimer()", 100)
    }
    catch(e)
    {
        console.log("An exception occurred in animateChessMove: " + e.message);
        return false;
    }

    return true;
}

// This method is called by the chess code dropPiece() method in chess_app.js. 
function postDropPiece(prettyMove)
{
    if (prettyMove == null)
        console.log("Last move object is unassigned.");
    {
        // Publish the move to our opponent.
        publishChessMove(prettyMove);
    }
}

// The main object that provides the top level functionality for the PubNub enabled chess board page.
var App = function () {

    // Get the URL arguments passed to this page.
    g_url_arguments = getUrlVars();

    if (typeof (g_url_arguments) == "undefined" || g_url_arguments == null)
    {
        alert("No URL arguments were passed to this page!");
        return;
    }

    // EXPECTED URL ARGUMENTS (error any not found)
    //   local_uuid             : The ID for the local user.
    //   remote_uuid            : The ID for the remote user (the opponent).
    //   pubnub_chess_channel   : The pubnub channel ID shared by the two players.
    //   local_skill_level      : The skill level for the local user.
    //   chess_side             : The side the local user is playing, "w" or "b" (White or Black).
    if (typeof (g_url_arguments["local_uuid"]) == undefined || g_url_arguments["local_uuid"] == null)
    {
        alert("The local user ID is missing from the URL arguments!");
        return;
    }
    g_local_uuid = g_url_arguments["local_uuid"]

    if (typeof (g_url_arguments["remote_uuid"]) == undefined || g_url_arguments["remote_uuid"] == null) {
        alert("The remote user ID is missing from the URL arguments!");
        return;
    }
    g_remote_uuid = g_url_arguments["remote_uuid"];

    if (typeof (g_url_arguments["pubnub_chess_channel"]) == undefined || g_url_arguments["pubnub_chess_channel"] == null) {
        alert("The PubNub channel ID is missing from the URL arguments!");
        return;
    }
    g_pubnub_chess_channel = g_url_arguments["pubnub_chess_channel"];

    if (typeof (g_url_arguments["local_skill_level"]) == undefined || g_url_arguments["local_skill_level"] == null) {
        alert("The local user's skill level is missing from the URL arguments!");
        return;
    }
    g_local_skill_level = g_url_arguments["local_skill_level"];

    if (typeof (g_url_arguments["chess_side"]) == undefined || g_url_arguments["chess_side"] == null)
    {
        alert("The color/side the local user is playing is missing from the URL arguments!");
        return;
    }
    g_chess_side = g_url_arguments["chess_side"];

    // Assign our post drop piece method to the chess_app.js gPostDropPieceMethod variable so that
    //  method gets called after every valid chess move.  It will be NULL if the last move was not
    //  valid.
    if (typeof gPostDropPieceMethod == "undefined")
    {
        console.log("The post drop piece method variable could not be found.  pubnub_chess.js must be loaded after chess_app.js");
    }
    gPostDropPieceMethod = postDropPiece;

    // Ok, we have all the information we need to create a PubNub link between the players.
    //  Initialize the PubNub module.
    pubnub = PUBNUB.init({
        publish_key: 'demo',
        subscribe_key: 'demo',
        uuid: g_local_uuid
    });

    // Subscribe to the shared channel given to us in the URL arguments that binds us
    //  to our opponent.
    // Subscribe to the channel we create to service this app.
    pubnub.subscribe({
        // The PubNub channel to subscribe to.
        channel: g_pubnub_chess_channel,
        // Pass our skill level with the state data field so it is available to the Presence API
        //  event handler.  Remember, on the receiving end, skill will be attached directly to the 
        //  object, NOT to an object named state. 
        //
        //  (E.g. - presenceData.data.skill, NOT presenceData.data.state.skill).
        state: { skill: g_local_skill_level },
        // Function to call when we receive a message from the PubNub channel.
        message: function (data) {

            // ============================ BEGIN: CHANNEL MESSAGE ROUTING CODE ======================

            // Show the new chat message.
            //if (data.type == 'chat') {
            //    Users.get(data.payload.uuid).chat(data.payload.text, $output);
            //}

            // ------------------- DISPLAY THE INCOMING CHAT MESSAGE ----------------

            if (data.type == 'chat')
            {
                // Build the HTML for a line of chat consisting of the sending user's ID and the message sent.
                var $line = $('<li class="list-group-item"><strong>' + data.payload.uuid + ':</strong> </span>');
                var $message = $('<span class="text" />').text(data.payload.text).html();

                $line.append($message);
                $output.append($line);

                // Scroll the chat window to ensure that the latest chat message is visible to the user.
                $output.scrollTop($output[0].scrollHeight);
            }

            // ------------------- EXECUTE THE REMOTE CHESS MOVE ---------------------

            if (data.type == 'chess_move') {
                // Show the data.
                console.log(data);

                // Is it intended for us to execute?
                if (data.target_uuid == g_local_uuid)
                {
                    if (typeof data.move == "undefined" || data.move == null)
                    {
                        console.log("Invalid move received from remote user!");
                        console.log(data);
                    }

                    // Yes, execute the move with full animation.
                    // var prettyMove = chess.move({ from: data.move.from, to: data.move.to, promotion: 'q' })
                    animateChessMove(data.move);

                }
            }
        },
        // Handle messages from the PubNub Presence API, the API that makes coordinating an online user list easy.
        presence: function (data) {

            // Show the presenceData.
            console.log(data);

            // Show the arrival of the opponent.
            if (data.action == "join" && data.uuid != g_local_uuid) {
                // Respond to the join event by showing the remote opponent's ID and skill level.
                $('#opponent').text(data.uuid);

                if (data.hasOwnProperty("skill"))
                    $('#opponent_skill').text(data.skill);
                else
                    $('#opponent_skill').text("unrated");
            }

            // Detect the exit of the opponent whether through a timeout condition or if they explicitlyi
            //  left the game.
            if (data.uuid != g_local_uuid && (data.action == "leave" || data.action == "timeout"))
            {
                alert(data.uuid + " has left the game.");

                // Respond to a leave or timeout event by removing the new user from the user list.
                $('#opponent').text("(nobody)");
                $('#opponent_skill').text("");
            }

            //if (data.action == "join") {
            //    // Respond to the join event by handling the new user.
            //    Users.set(data.uuid, data.state).init();
            //}

            //if (data.action == "leave" || data.action == "timeout") {
            //    // Respond to a leave or timeout event by removing the new user from the user list.
            //    Users.remove(data.uuid);
            //}

        }
    });

    // Show the local user's ID and skill level.
    $('#whoami').text(g_local_uuid);
    $('#my_skill').text(g_local_skill_level);

    // Establish easy references to important chat related HTML elements.
    $chat_form = $('#private-chat');
    $output = $('#private-chat-output');
    $input = $('#private-chat-input');

    // This is the function that will be called when the current user enters a chat message.
    //  It will publish it the chat message to the PubNub private channel the game is
    //  using.
    $chat_form.submit(function ()
    {

        console.log($input);

        pubnub.publish({
            channel: g_pubnub_chess_channel,
            message: {
                type: 'chat',
                payload: {
                    // Pass on the text message entered by the user.
                    text: $input.val(),
                    // The current user ID is the source ID for the chat message.
                    uuid: g_local_uuid
                }
            }
        });

        $input.val('');

        return false;

    });
}