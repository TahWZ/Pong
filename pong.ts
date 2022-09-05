import { interval, fromEvent, range, from, zip } from 'rxjs'
import { map, scan, filter, merge, flatMap, take, concat, last, retry} from 'rxjs/operators'

function pong() {
    // Inside this function you will use the classes and functions 
    // from rx.js
    // to add visuals to the svg element in pong.html, animate them, and make them interactive.
    // Study and complete the tasks in observable exampels first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/ 
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code!  

    //###################################( Immutable variables )######################################
    const Constants = new class {
        /* The canvas is widely required throughout the code so having its reference stored in an
         * immutable will help prevent the need of repeating its call*/
        readonly canvas:HTMLElement = document.getElementById("canvas");
        readonly w:number = 600; //the width
        readonly h:number = 600; //the height
        readonly maxBallSpeedX:number = 3.5; //the max horizontal speed of the ball
        readonly maxBallSpeedY:number = 2; // the max vertical speed of the ball
        readonly AIspeed:number = 1.6; // the speed of the paddle as it chases the ball
    }
    
    //++++++++++++++++++++++++++++++++++( Codes from slide/ Asteroids )+++++++++++++++++++++++++++++++

    /**attr is a helper function which helps set the properties of an Element through key-value pairs
     * where the key is the attribute to have its value replaced.
     * 
     * @param e The element to have its attribute set
     * @param o A collection of element attributes with its values as key-value pairs
     */
    const attr = (e:Element,o:any):void => { for(const k in o) e.setAttribute(k,String(o[k])) };
    /**observableK is a function which creates an Observable using the fromEvent function which
     * performs an action whenever a specific keyboard event occurs and identified by k
     * 
     * @param event   The type of keyEvent (eg: keyup,keydown)
     * @param k       The key code is used to identify which key has been pressed
     * @param action  The action basically creates a class which only has read-only attributes 
     */
    const observableK = <T>(event:keyEvent, k:keycode, action:()=>T)=>
      fromEvent<KeyboardEvent>(document,event)
        .pipe(
          filter((e)=> e.keyCode === k),
          filter(({repeat})=>!repeat),
          map(action));

    //################################( Body types and Game state )#####################################

    /*These interfaces below contains only readonly members (the body of all other elements), 
     * the scan function for observables uses the gameState as a template. Instead of having the attributes stored
     * as mutable variabels the scan function will transduce the state of the game which maintains the purity of the
     * code. 
     */

    /* The gameState contains the body (other interfaces) and boolean values. The gameState is required as 
     * the attributes of the bodies might be required for calculations in other bodies. Having a single 
     * interface to store the others allows the bodies to have access to the other attributes and maintain
     * the purity of the code */
    type gameState = Readonly<{
      leftP: paddleBody; rightP: paddleBody;
      ball: ballBody;
      leftS: scoreBody; rightS: scoreBody;
      centerText: textBody;
      start: boolean; restart: boolean;
      blocks: ReadonlyArray<blockBody>;
    }>

    //Body for paddle
    type paddleBody = Readonly<{
      id: Element; 
      x: number; y: number;
      width: number; height: number;
      fill: string;
    }>

    //Body for ball
    type ballBody = Readonly<{
      id: Element
      cx: number; cy: number;
      r: number;
      fill: string;
      speedX: number; speedY: number;
    }>

    //Body for score
    type scoreBody = Readonly<{
      id: Element;
      score: number;
    }>

    //Body for text
    type textBody = Readonly<{
      id: Element;
      text: string;
      style: string;
      fill: string;
    }>

    //Body for block (HD idea: Incorporate breakout gameplay)
    type blockBody = Readonly<{
      id: Element; 
      x: number; y: number;
      width: number; height: number;
      fill: string;
    }>

    //########################################( Player )#######################################
    
    //Initialise the Player in the HTML
    const 
      leftP: Element = document.createElementNS(Constants.canvas.namespaceURI,'rect'),
      //This is the initial body of the player's paddle (The attributes the paddle starts with)
      initialPlayer : paddleBody = {id:leftP,x:Constants.w/12,y:Constants.h/6,width:Constants.w/24,height:Constants.h/6,fill:'#FFFFFF'};
    Constants.canvas.appendChild(leftP);

    //These two are used to ensures the appropriate values are restricted
    type keyEvent = 'keydown' | 'keyup';
    type keycode = 90 | 88 | 86 | 67;

    /* These simple classes are mainly used for the reduce function, this is because the
     * reduce function needs a way to identify the action thats to be done, simple 
     * classes can be identified with instanceof which allows the apprpriate actions to be performed
     * when the reduce function runs */
    class Move { constructor(public readonly x: number, public readonly y:number) {}}
    class Resize { constructor(public readonly width: number, public readonly height:number) {}}
    class Highlight { constructor(public readonly color: string) {}}
    class Pull { constructor(public readonly color: Highlight){}}
    class Block { constructor(){}}

    /* When the mouse is within the canvas, the left paddle will follow its position
     */
    const move = fromEvent<MouseEvent>(Constants.canvas, "mousemove").
      pipe(
        filter(r => r.offsetY >= initialPlayer.height/2 && r.offsetY <= Constants.h-initialPlayer.height/2),
        map(r => new Move(initialPlayer.x,r.offsetY)))
    
    // The following are actions created for the HD idea (Add power-ups to game) and (Incoporate arcade gameplay (breakout))
    const
      // Makes the player paddle larger
      largerPaddle = observableK('keydown',88, ()=> 
        new Resize(initialPlayer.width,initialPlayer.height*2)),
      // Makes the paddle return to its initial size 
      normalPaddle = observableK('keyup',67,()=>
        new Resize(initialPlayer.width,initialPlayer.height)),
      // Makes the paddle change color and pulls the opposing paddle to your current y position
      pull = observableK('keydown',90, ()=>
        new Pull(new Highlight('FF0000'))),
      //Changes the color of the paddle back
      pullC = observableK('keyup',90, ()=>
        new Highlight('#FFFFFF')),
      //Add a series of blocks on the opposing players side (breakout gameplay mechanic)
      addB = observableK('keydown',86, ()=>
        new Block());
      
    //#################################### ( AI )############################################
    
    //Initialise the AI in the HTML
    const 
      rightP: Element = document.createElementNS(Constants.canvas.namespaceURI,'rect'),
      //This is the initial body of the AI's paddle (The attributes the paddle starts with)
      initialAI : paddleBody = {id:rightP,x:Constants.w-Constants.w/12-Constants.w/24,y:Constants.h/6,width:Constants.w/24,height:Constants.h/6,fill:'#FFFFFF'};
    Constants.canvas.appendChild(rightP);

    //####################################( Ball )#########################################

    //Initialise the Ball in the HTML
    const
      initialBall: Element = document.createElementNS(Constants.canvas.namespaceURI,'circle'),
      //This is the initial body of the ball (The attributes the ball starts with)
      Ball: ballBody = {id: initialBall, cx: Constants.w/2,cy: Constants.h/2, r: 5, fill: "#FFFFFF", 
        //This makes the beggining speed of the ball will make the ball move towards the player's side at the center
        speedX: -1.5, speedY: 0};
    Constants.canvas.appendChild(initialBall);

    //##################################( Calculations/Collision )#######################################
    
    /* The function that does all the calculations for transfomation with the reduce function, this function will take a gameState and
     * perform the required modifications which includes:
     * 1. Update the ball position
     * 2. Update the ball speed (Collsion included)
     * 3. Update the score and ball position if ball hits either player's wall
     * 4. Ends the game when score updates to 7
     */
    const handleCalc = (s:gameState):gameState => {
      const 
        //function which returns a Boolean value based on whether a collision occured between a paddle and ball
        paddleCollision = (a: paddleBody,b: ballBody):boolean => 
          b.cx <= a.x+a.width && b.cx >= a.x && 
          b.cy <= a.y+a.height && b.cy >= a.y,
        //Boolean value indicating whether the ball touched the top or bottom of the canvas
        wallYcollison = (a:ballBody):boolean => a.cy < 0 || a.cy > Constants.h,
        //Boolean value indicating whether the ball touched the left/right wall
        wallL = (a:ballBody):boolean => a.cx < 0, wallR = (a:ballBody):boolean => a.cx > Constants.w, 
        //Boolean value indicating whether the ball touched the left/right paddle
        leftPcol=paddleCollision(s.leftP,s.ball), rightPcol=paddleCollision(s.rightP,s.ball),
        //function which returns Boolean which indicates whether a block and the ball collided (HD idea)
        blockCollision = (b:ballBody) => (a:blockBody) => b.cx <= a.x+a.width && b.cx >= a.x && b.cy <= a.y+a.height && b.cy >= a.y,
        //The ball's X speed will vary base on whether it collides with the walls of the canvas or the paddle
        nSpeedX = leftPcol ? newSpeedX(s.leftP,s.ball) : rightPcol ? -newSpeedX(s.rightP,s.ball) : //when collide with left/right paddle
          s.blocks.reduce((a,v)=> a == true ? true : blockCollision(s.ball)(v), false) ? -s.ball.speedX : //when collide with blocks (HD idea)
          wallR(s.ball) ? 1.5 : wallL(s.ball) ? -1.5 :s.ball.speedX, //when goal occurs
        //The ball's Y speed will vary base on whether it collides with the walls of the canvas or the paddle
        nSpeedY = leftPcol ? newSpeedY(s.leftP,s.ball) : rightPcol ? newSpeedY(s.rightP,s.ball) : //when collide with left/right paddle
          wallYcollison(s.ball) ? -s.ball.speedY : //when collide with top/bottom of wall
          wallR(s.ball)||wallL(s.ball) ? 0 : s.ball.speedY, //when a paddle scores
        //This resets the ball x position when the ball collides with either left or right wall, and also adjust it when colliding with paddle
        nCx = leftPcol ? s.leftP.x+s.leftP.width : rightPcol ? s.rightP.x : wallR(s.ball) || wallL(s.ball) ? Constants.w/2 : s.ball.cx,
        //This resets the ball y position when the ball collides with either left or right wall
        nCy = wallR(s.ball) || wallL(s.ball) ? Constants.h/2 : s.ball.cy,
        //Updates the score if left/right player scores
        nScoreL = wallR(s.ball) ? s.leftS.score+1 : s.leftS.score, nScoreR = wallL(s.ball) ? s.rightS.score+1 : s.rightS.score;
        //Remove all blocks which have collided with the ball (HD idea)
        s.blocks.filter(blockCollision(s.ball)).forEach(v=>Constants.canvas.removeChild(v.id))
      //Returns a gameState which contains all updated values (preserves the purity of the code)
      return <gameState>{...s,
        ball: {...s.ball,
          speedX: nSpeedX, speedY: nSpeedY, //Updates the ball speed
          cx: nCx+nSpeedX, cy: nCy+nSpeedY, //Updates the ball position (Moves the ball)
        },
        rightP:{...s.rightP,
          //Makes the right paddle follow the ball in a constant speed
          y: s.ball.cy < s.rightP.y+s.rightP.height/2 ? s.rightP.y-Constants.AIspeed : s.rightP.y+Constants.AIspeed 
        },
        leftS: {...s.leftS, score: nScoreL,}, rightS: {...s.rightS,score: nScoreR //Updates the score
        },
        restart: nScoreL<7&&nScoreR<7, //Boolean which stops the game
        blocks: s.blocks.filter(e=>!(blockCollision(s.ball)(e))) //Removes all blocks which has collided with the ball (HD idea)
      }
    }
    
    /**The following function will calculate the ball's new horizontal speed when colliding based on the distance between the ball and the center of
     * the paddle. The horizontal speed of the ball will be faster the closer it is to the center but will be at least 1.
     * (With the newSpeedY function it ensures the ball will bounce at an angle of 80 degrees at max)
     * 
     * @param a the paddleBody which contains x and y values of the collided paddle
     * @param b the ballBody which contains x and y values of the collided ball
     */
    function newSpeedX(a: paddleBody,b: ballBody):number{
      return Math.max(Constants.maxBallSpeedX*Math.abs(Math.cos(((a.y+(a.height/2)-b.cy)/(a.height/2))*80*Math.PI/180*Math.PI/2)),1)
    }

    /**The following function will calculate the ball's new vertical speed when colliding based on the distance between the ball and the center of
     * the paddle. The vertical speed of the ball will be faster the further it is to the center.
     * (With the newSpeedX function it ensures the ball will bounce at an angle of 80 degrees at max)
     * 
     * @param a the paddleBody which contains x and y values of the collided paddle
     * @param b the ballBody which contains x and y values of the collided ball
     */
    function newSpeedY(a: paddleBody,b: ballBody):number{
      return -Constants.maxBallSpeedY*Math.sin(((a.y+(a.height/2)-b.cy)/(a.height/2))*80*Math.PI/180*Math.PI/2)
    }

    //####################################( Score/Cheat text )#########################################
    //Initialises all the scores and center text
    const 
      centerText = document.createElementNS(Constants.canvas.namespaceURI,'text'),
      scoreL = document.createElementNS(Constants.canvas.namespaceURI,'text'),
      scoreR = document.createElementNS(Constants.canvas.namespaceURI,'text');
    
    //Provides the initial attributes of the scores and center text
    function startText(t:Element,x:number,y:number): void{
      Object.entries({
        x: x, y: y,
        fill: '#FFFFFF',
        style: "font-size:50px",
      }).forEach(([key,val])=>t.setAttribute(key,String(val)))
    }

    //Initialises all the scores and center text
    startText(scoreL,Constants.w/3,Constants.h/6),startText(scoreR,Constants.w-Constants.w/3-Constants.w/24,Constants.h/6),startText(centerText,Constants.w/15,Constants.h/2);

    //Adds the scores and center text to the canvas
    Constants.canvas.appendChild(scoreL),Constants.canvas.appendChild(scoreR),Constants.canvas.appendChild(centerText);

    //Initial scores and center text body
    const 
      initialCenterText: textBody = {id:centerText,text:"Click here to Start Game",style:"font-size:40px",fill:"#FFFFFF"},
      ScoreL: scoreBody = {id:scoreL,score:0},
      ScoreR: scoreBody = {id:scoreR,score:0};

    //####################################( Additional )#########################################

    /* A pure function which utilizes the flatmap and map functions to create the blocks positioned similar to
     * the breakout game. Furthermore, returns a blockBody ReadonlyArray which contains all previous and present blocks */
    function addBlocks(s:ReadonlyArray<blockBody>):ReadonlyArray<blockBody>{
      const rangeX = [0,1,2]
      const rangeY = [0,1,2,3,4,5,6,7,8,9,10,11]
      //No loops were used, only map and flatMap
      return s.concat(rangeX.flatMap(c=>rangeY.map(r=>[c,r])).map(a=>{
        const block = document.createElementNS(Constants.canvas.namespaceURI,'rect')
        Constants.canvas.appendChild(block)
        return <blockBody>{id:block,x:25*a[0]+420,y:50*a[1]+5,width:20,height:40,fill:'#FFFFFF'}}))
    }

    // This adds the dotted line in the center (Helps player determine the center of the game)
    const centerLine = document.createElementNS(Constants.canvas.namespaceURI,'line');
    Object.entries({
      x1: Constants.w/2, y1: 0,
      x2: Constants.w/2, y2: Constants.h,
      style: "stroke:rgb(255,255,255);stroke-width:5px;stroke-dasharray: 10 10",
    }).forEach(([key,val])=>centerLine.setAttribute(key,String(val)))
    Constants.canvas.appendChild(centerLine);

    //####################################( Game )#########################################

    //initial gameState
    const initialGame: gameState = {leftP: initialPlayer, rightP: initialAI,ball: Ball,leftS: ScoreL,rightS: ScoreR,centerText: initialCenterText,start: false,restart: false, blocks: []}

    //The click indicates whether the game is to begin or restart
    class Click { constructor() {}}

    //Contains all the actions in the game
    type Action = Move|Resize|Highlight|Pull|Click|Block

    //Observable for mouse click events
    const clickCenter = fromEvent<MouseEvent>(centerText, "click").
      pipe(
        map(_=> new Click()))

    //The function below is used to update the attributes, this allows the game view to update
    const updateGame = (state: gameState):void => {
      updatePaddle(state.leftP), updatePaddle(state.rightP);
      updateBall(state.ball);
      updateScore(state.leftS),updateScore(state.rightS);
      updateText(state.centerText);
      //Each block is required to update
      state.blocks.forEach(updateBlock);
    }

    //The update method for every distinct body type
    function updatePaddle(state: paddleBody): void {attr(state.id,state)}
    function updateBlock(state: blockBody): void {attr(state.id,state)}
    function updateBall(s:ballBody):void {attr(s.id,{cx:s.cx,cy:s.cy,r:s.r,fill:s.fill})}
    function updateScore(s:scoreBody):void{s.id.textContent = String(s.score)}
    function updateText(s:textBody):void{s.id.textContent = s.text,attr(s.id,{style: s.style, fill: s.fill})}
    
    /** The reduce method which the scan method relies on to perform all necessary transformations based on the action,
     *  uses the handleCalc to do all the calculations required.
     * (does not update the view) 
     * 
     * @param s The gameState to perform all required modifications
     * @param e The action performed (if any)
     */
    const reduceGame = (s:gameState, e:Action):gameState =>
      e instanceof Click && (s.restart==false || s.start==false) ? //Re-runs the game when the game ends or just began
        <gameState>{...initialGame,blocks:s.blocks,restart:true,start:true,centerText: {...s.centerText,text: ""}} :
      s.start == false ? s : //When the game starts, it doesn't run until the player clicks the centerText
      s.restart == false ? //When the game ends, it remains in a paused state
        <gameState>{...s,centerText: {...s.centerText,text: s.leftS.score == 7 
          ? "Left Player Wins! Restart?" : "Right Player Wins! Restart?"}} :
      e instanceof Pull ? //Performs a pull action (Position the right paddle at the left paddle's vertical position)
        handleCalc({...s,
          leftP: reducePaddle(<paddleBody>{...s.leftP},e.color), rightP: {...s.rightP,y: s.leftP.y}
      }): e instanceof Block ? {...s, //Adds blocks to the game (HD idea: incoporate breakout gameplay)
        blocks: s.blocks.length == 0 ? addBlocks(s.blocks) : s.blocks} :
      e ? handleCalc({...s, //Performs the appropriate modifications on the player's paddle (with the reducePaddle function)
        leftP: reducePaddle(s.leftP,e)
      }): handleCalc(s); //Just perform the usual calculations when no actions were used
    
    //Reduce method for the player's paddle (HD idea: power ups)
    const reducePaddle = (s: paddleBody, e: Action):paddleBody =>
      e instanceof Move ? {...s,
        x:e.x, y:e.y-s.height/2}
      : e instanceof Resize ? {...s, //Power up which increases the paddle size
        width:e.width, height:e.height}
      : e instanceof Highlight ? {...s, //Power up effect (to decorate the paddle)
        fill: e.color
      }: {...s};

    /* The main Observable which merged all different inputs, performs the scan and updates the game 
     * (contains the final subscribe call which is also the only subscribe call) */
    interval(1)
      .pipe(
        map(_=>_),
        merge(
          move,clickCenter), //Mouse events
        merge(
          largerPaddle,normalPaddle,pull,pullC,addB //keyboard events
        ),
        //The main function which transduces the state
        scan(reduceGame, initialGame))
      .subscribe(updateGame);
  }
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
  if (typeof window != 'undefined')
    window.onload = ()=>{
      pong();
    }

