var exists = function(rows, i, j){
    return rows[i] != undefined && rows[i][j] != undefined;
}

var drawPiece = function(rows, piece, drawGhost){
    var position = piece.position;
    var ignored = [];
    var shape = piece.getShape();
    _.each(shape, function(row, i){
        _.each(row, function(cell, j){
            if(cell){
                var ci = i+position[0];
                var cj = j+position[1];
                if(exists(rows, ci, cj)){
                    if(drawGhost){
                        ignored.push([ci, cj]);
                    }
                    rows[ci][cj] = {
                        color: piece.color,
                        type: "solid",
                    }
                }
            }
        });
    });
    if(drawGhost){
        var ghostPosition = [position[0], position[1]];
        var hit = false;
        while(!hit){
            if(colisionCheck(rows, shape, ghostPosition[1], ghostPosition[0], ignored)){
                hit = true;
                ghostPosition[0]--;
                break;
            }
            _.each(shape, function(row, i){
                _.each(row, function(cell, j){
                    if(cell){
                        var ci = i+ghostPosition[0];
                        var cj = j+ghostPosition[1];
                        if(!exists(rows, ci, cj)){
                            hit = true;
                            return false;
                        }
                    }
                });
            });
            if(hit){
                break;
            }
            ghostPosition[0]++;
        }
        if(ghostPosition[0] > 20){
            ghostPosition[0] = 20;
        }
        _.each(shape, function(row, i){
            _.each(row, function(cell, j){
                if(cell){
                    var ci = i+ghostPosition[0];
                    var cj = j+ghostPosition[1];
                    if(exists(rows, ci, cj)){
                        rows[ci][cj] = {
                           color: piece.color,
                           type: "ghost",
                        }
                    }
                }
            });
        });
    }
}

var colisionCheck = function(rows, shape, x, y, ignored){
    var result = false;
    _.each(shape, function(row, j){
        _.each(row, function(cell, i){
            var xi = x + i;
            var yj = y + j;
            var ignoreThis = false;
            if(cell && !_.isUndefined(ignored)){
                _.each(ignored, function(ignoredCell){
                    if(xi == ignoredCell[1] && yj == ignoredCell[0]){
                        ignoreThis = true; // ignore colision with this point.
                        return false;
                    }
                })
            }
            if(!ignoreThis && cell && (!exists(rows, yj, xi) || rows[y+j][x+i].type != "empty")){
                  result = true;
                  return false; // just to break the loop, result variable will be returned accordingly.
            }
        });
    });
    return result;
}

var collide = function(rows, piece, x, y){
    return colisionCheck(rows, piece.getShape(), x, y);
}

var move = function(state, plusX, plusY){
   var hasCollided = false;
   if(!state.pause && !state.gameover){
       var pieces = state.pieces;
       _.each(pieces, function(piece, i){
           var position = piece.position;
           var newX = position[1] + plusX;
           var newY = position[0] + plusY;
           var colision = collide(state.rows, piece, newX, newY);
           if(!colision){
                piece.position = [newY, newX];
           } else{
                hasCollided = true;
           }
       });
   }
   return !hasCollided;
}

var keyMap = {
    37: [-1, 0],
    40: [0, 1],
    39: [1, 0],
    100: [-1, 0],
    98: [0, 1],
    102: [1, 0],
}

var Piece = function(shapes, position, color){
    this.nextShapeIndex = function(){
        var nextShape = this.shapeIndex + 1;
        if(nextShape > this.shapes.length - 1){
            nextShape = 0;
        }
        return nextShape;
    };
    this.previousShapeIndex = function(){
        var previosShape = this.shapeIndex - 1;
        if(previosShape < 0){
            previosShape = this.shapes.length - 1;
        }
        return previosShape;
    };
    this.previousShape = function(){
        return this.shapes[this.previousShapeIndex()];
    };
    this.nextShape = function(){
        return this.shapes[this.nextShapeIndex()];
    };
    this.shapeIndex = 0;
    this.rotateNext = function(){
        this.shapeIndex = this.nextShapeIndex();
    };
    this.rotatePrevious = function(){
        this.shapeIndex = this.previousShapeIndex();
    };
    this.getShape = function(){
        return this.shapes[this.shapeIndex];
    };
    this.shapes = shapes;
    this.position = position;
    this.color = color;
}

var TETRIMINOS = {
    i: [[[false, false, false, false], [true, true, true, true], [false, false, false, false], [false, false, false, false]],
       [[false, false, true, false], [false, false, true, false], [false, false, true, false], [false, false, true, false]],
       [[false, false, false, false], [false, false, false, false], [true, true, true, true], [false, false, false, false]],
       [[false, true, false, false], [false, true, false, false], [false, true, false, false], [false, true, false, false]]],
    j: [[[true, false, false],[true, true, true],[false, false, false]],
        [[false, true, true],[false, true, false],[false, true, false]],
        [[false, false, false],[true, true, true],[false, false, true]],
        [[false, true, false],[false, true, false],[true, true, false]]],
    l: [[[false, false, true],[true, true, true],[false, false, false]],
        [[false, true, false],[false, true, false],[false, true, true]],
        [[false, false, false],[true, true, true],[true, false, false]],
        [[true, true, false],[false, true, false],[false, true, false]]],
    o: [[[false, true, true, false],[false, true, true, false],[false, false, false, false]],
        [[false, true, true, false],[false, true, true, false],[false, false, false, false]],
        [[false, true, true, false],[false, true, true, false],[false, false, false, false]],
        [[false, true, true, false],[false, true, true, false],[false, false, false, false]]],
    s: [[[false, true, true],[true, true, false],[false, false, false]],
        [[false, true, false],[false, true, true],[false, false, true]],
        [[false, false, false],[false, true, true],[true, true, false]],
        [[true, false, false],[true, true, false],[false, true, false]]],
    t: [[[false, true, false],[true, true, true],[false, false, false]],
        [[false, true, false],[false, true, true],[false, true, false]],
        [[false, false, false],[true, true, true],[false, true, false]],
        [[false, true, false],[true, true, false],[false, true, false]]],
    z: [[[true, true, false],[false, true, true],[false, false, false]],
        [[false, false, true],[false, true, true],[false, true, false]],
        [[false, false, false],[true, true, false],[false, true, true]],
        [[false, true, false],[true, true, false],[true, false, false]]]
}

var COLORS = {
    i: "cyan",
    o: "yellow",
    t: "purple",
    s: "green",
    z: "red",
    j: "blue",
    l: "orange"
}

var sequence = [];

var randomBag = function(){
    if(sequence.length > 0){
        return sequence.pop();
    }
    var bag = _.range(7);
    while(bag.length > 0){
        sequence.push(bag.splice(Math.floor(bag.length*Math.random()),1));
    }
    return randomBag();
}

var completeRows = function(rows){
    var height = rows.length;
    var i = height-1;
    var n = 0;
    while(i > 0){
        var rowIsComplete = _.every(rows[i], function(cell){
            return !_.isEqual(cell.type, "empty");
        });
        if(rowIsComplete){
            n++;
            var j = i;
            while(j > 0){
                rows[j] = rows[j-1];
                j--;
            }
            rows[0] = _.map(_.range(rows[0].length), function(){
                return {
                    type: "empty",
                    color: "empty"
                }
            });
        } else{
            i--;
        }
    }
    return n;
}

var gameOverflow = function(rows){
    var checkEmptiness = function(cell){
        return _.isEqual(cell.type, "empty");
    }
    var row0IsEmtpy = _.every(rows[0], checkEmptiness);
    var row1IsEmtpy = _.every(rows[1], checkEmptiness);
    return !row0IsEmtpy || !row1IsEmtpy;
}

var FRAME_MAP = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6,
    5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];

var calculateSpeed = function(level){
    if(level > 28){
        frames = 1;
    } else{
        frames = FRAME_MAP[level];
    }
    return 16 * frames;
}

var buildTetrimino = function(){
    var randomIndex = randomBag();
    var template = _.keys(COLORS)[randomIndex];
    var tetrimino = new Piece(TETRIMINOS[template], [0,2], COLORS[template]);
    return tetrimino;
}

var GridTable = React.createClass({
  getInitialState: function(){
    var width = 22;
    var height = 10;
    var rows = _.map(_.range(width), function(){
        return _.map(_.range(height), function(){
           return {
               color: "empty",
               type: "empty"
           }
        });
    });
    var queue = [];
    queue[0] = buildTetrimino();
    queue[1] = buildTetrimino();
    queue[2] = buildTetrimino();
    return {
        pause: false,
        rows: rows,
        fixed: [],
        lock: 0,
        combo: 0,
        pieces: [],
        points: 0,
        gameover: false,
        musicEnabled: true,
        soundEnabled: true,
        completedRowsThisLevel: 0,
        level: 0,
        levelSign: null,
        ghost: true,
        queue: queue,
        justSwapped: false,
    }
  },
  swap: function(){
    var state = this.state;
    if(state.justSwapped){
        return;
    }
    var newSwap = state.pieces[0];
    newSwap.position=[0,2];
    var oldSwap = state.swap;
    if(!oldSwap){
        oldSwap = this.nextTetrimino();
    }
    state.pieces[0] = oldSwap;
    state.swap = newSwap;
    state.justSwapped = true;
  },
  nextTetrimino: function(){
    var queue = this.state.queue;
    queue[3] = buildTetrimino();
    var tetrimino = queue.shift();
    this.state.queue = queue;
    return tetrimino;
  },
  gameover: function(){
      this.state.gameover = true;
      this.stopMusic();
  },
  componentDidMount: function(){
    var nextTetrimino = this.nextTetrimino;
    var t = 0;
    var tick = function(){
        var speed = calculateSpeed(this.state.level);
        var state = this.state;
        var playBlockSound = this.playBlockSound;
        var pieces = state.pieces;
        var now = _.now();
        var diff = now - state.levelSign;
        if(diff > 3000){
            state.levelSign = null;
        }
        if(pieces.length == 0 && !state.gameover){
            var tetrimino = nextTetrimino();
            pieces.push(tetrimino);
            state.justSwapped = false;
        } else{
            if(t > speed){
                t = 0;
                if(move(state, 0, 1)){
                    state.lock = _.now();
                    this.setState(state);
                } else{
                    var size = pieces.length;
                    _.each(pieces, function(piece){
                        var lock = state.lock;
                        if(now - lock > 100){
                            var position = piece.position;
                            _.each(piece.getShape(), function(row, j){
                                _.each(row, function(cell, i){
                                    var fixX = position[1]+i;
                                    var fixY = position[0]+j;
                                    if(cell && exists(state.rows, fixY, fixX)){
                                        state.rows[fixY][fixX].color = piece.color;
                                        state.rows[fixY][fixX].type = "solid";
                                    }
                                });
                            });
                            pieces.splice(piece);
                            playBlockSound();
                        }
                    });
                    var completedRows = completeRows(state.rows);
                    var newPoints = 0;
                    if(completedRows == 4){
                        newPoints += 800; // tetris! \o/
                    } else{
                        newPoints += completedRows * 100;
                    }
                    state.completedRowsThisLevel += completedRows;
                    if(state.completedRowsThisLevel >= 10){  // NEXT LEVEL! >=D
                        state.completedRowsThisLevel = 0;
                        state.level++;
                        state.levelSign = now;
                    }
                    if(pieces.length < size && newPoints > 0){ // a piece was removed and it made points
                        state.combo++;
                    } else if(newPoints <= 0){  // lost the combo =(
                        state.combo = 0;
                    }
                    var comboPoints = 0;
                    if(state.combo > 1){
                        comboPoints = (-1+state.combo)*50;
                    }
                    state.points += newPoints + comboPoints;
                    var overflow = gameOverflow(state.rows);
                    if(overflow){
                        this.gameover();
                    } else if(pieces.length == 0){
                        var tetrimino = nextTetrimino();
                        pieces.push(tetrimino);
                        state.justSwapped = false;
                        var colision = collide(state.rows, tetrimino, 2, 0);
                        if(colision){
                            this.gameover();
                        }
                    }
                    this.setState(state);
                }
            } else{
                t++;
            }
        }
    }
    setInterval(tick.bind(this), 1);
    window.addEventListener('keydown', this.handleKey);
    var music = document.getElementById("music");
    music.volume = 0.2;
    this.playMusic();
  },
  toggleEnableMusic: function(){
    this.state.musicEnabled = !this.state.musicEnabled;
  },
  playMusic: function(){
    if(this.state.musicEnabled){
        //document.getElementById("music").play();
    }
  },
  stopMusic: function(){
      document.getElementById("music").pause();
  },
  playBlockSound: function(){
    if(this.state.soundEnabled){
      //document.getElementById("block").play();
    }
  },
  handleKey: function(event){
    var state = this.state;
    var code = event.keyCode;
    if(code == 80){
        this.pause();
    }
    if(!state.pause && !state.gameover){
        if(code == 65 || code == 32){
            _.each(state.pieces, function(piece){
                var position = piece.position
                if(!colisionCheck(state.rows, piece.nextShape(), position[1], position[0])){
                    piece.rotateNext();
                } else{
                    // TODO: som de travado.
                }
            });
            this.setState(state);
        } else if(code == 8){
            _.each(state.pieces, function(piece){
                var position = piece.position
                if(!colisionCheck(state.rows, piece.previousShape(), position[1], position[0])){
                    piece.rotatePrevious();
                } else{
                    // TODO: som de travado.
                }
            });
        } else if(code == 38) { // hard drop
            _.each(state.pieces, function(piece){
                var position = piece.position
                var falling = true;
                var delta = keyMap[40];
                while(falling){
                    falling = move(state, delta[0], delta[1]);
                }
            });
            var now = _.now();
            var pieces = state.pieces;
            var size = pieces.length;
            _.each(pieces, function(piece){
                var lock = state.lock;
                if(now - lock > 100){
                    var position = piece.position;
                    _.each(piece.getShape(), function(row, j){
                        _.each(row, function(cell, i){
                            var fixX = position[1]+i;
                            var fixY = position[0]+j;
                            if(cell && exists(state.rows, fixY, fixX)){
                                state.rows[fixY][fixX].color = piece.color;
                                state.rows[fixY][fixX].type = "solid";
                            }
                        });
                    });
                    pieces.splice(piece);
                    //playBlockSound();
                }
            });
            var completedRows = completeRows(state.rows);
            var newPoints = 0;
            if(completedRows == 4){
                newPoints += 800; // tetris! \o/
            } else{
                newPoints += completedRows * 100;
            }
            state.completedRowsThisLevel += completedRows;
            if(state.completedRowsThisLevel >= 10){  // NEXT LEVEL! >=D
                state.completedRowsThisLevel = 0;
                state.level++;
                state.levelSign = now;
            }
            if(pieces.length < size && newPoints > 0){ // a piece was removed and it made points
                state.combo++;
            } else if(newPoints <= 0){  // lost the combo =(
                state.combo = 0;
            }
            var comboPoints = 0;
            if(state.combo > 1){
                comboPoints = (-1+state.combo)*50;
            }
            state.points += newPoints + comboPoints;
            var overflow = gameOverflow(state.rows);
            if(overflow){
                this.gameover();
            } else if(pieces.length == 0){
                var tetrimino = this.nextTetrimino();
                pieces.push(tetrimino);
                state.justSwapped = false;
                var colision = collide(state.rows, tetrimino, 2, 0);
                if(colision){
                    this.gameover();
                }
            }
            this.setState(state);
        } else if(code == 13){
            this.swap();
        }
        if(event.type == "keydown"){
            var delta = keyMap[code];
            if(delta != undefined){
                if(move(this.state, delta[0], delta[1])){
                   this.setState(this.state);
                }
            }
        }
        this.setState(state);
    }
  },
  pause: function(){
    console.log("pause");
    this.state.pause = !this.state.pause;
    this.setState(this.state);
    if(this.state.pause){
        this.stopMusic();
    } else{
        this.playMusic();
    }
  },
  ghost: function(){
    this.state.ghost = !this.state.ghost;
    this.setState(this.state);
  },
  reset: function(){
    this.state = this.getInitialState();
    this.setState(this.state);
    document.getElementById("music").currentTime = 0;
    this.playMusic();
  },
  render: function() {
    var state = this.state;
    var result = _.map(state.rows, function(row){
        return _.map(row, function(cell){
            return cell;
        });
    });
    _.each(state.pieces, function(piece){
        drawPiece(result, piece, state.ghost);
    });
    return (
        <div>
            <div id="sound">
                <audio
                id="music"
                src="/mp3/tetris-gameboy-02-crop.mp3"
                autoplay="false"
                loop="true"
                preload="true"
                ></audio>
                <audio
                autoplay="false"
                id="block"
                src="/mp3/5.wav"
                ></audio>
            </div>
            <table>
                <tbody>
                    <tr>
                        <td>
                            <h4>Hold</h4>
                            <table className={this.state.pause ? "tetristable showPiecesTable1 pause" : "tetristable showPiecesTable1"}>
                                <tbody>
                                    {
                                        _.map(_.range(5), function(row, i){
                                            var state = this;
                                                if(!!state.swap){
                                                var tetrimino = state.swap;
                                                var tetriminoColor = tetrimino.color;
                                                var tetriminoShape = tetrimino.getShape();
                                            }
                                            return (
                                                <tr key={i}>
                                                    {
                                                        _.map(_.range(5), function(cell, j){
                                                            var color = "empty";
                                                            if(!!state.swap){
                                                                if(i > 0 && j > 0){
                                                                    if(i - 1 < tetriminoShape.length){
                                                                        if(j - 1 < tetriminoShape[i-1].length && tetriminoShape[i-1][j-1]){
                                                                            color = tetriminoColor;
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                            return (
                                                                <td key={j} className={color}>
                                                                </td>
                                                            )
                                                        })
                                                    }
                                                </tr>
                                            )
                                        }, this.state)
                                    }
                                </tbody>
                            </table>
                        </td>
                        <td>
                            <table className={this.state.pause ? "tetristable main pause" : "tetristable main"}>
                                <tbody>
                                    {
                                        _.map(result, function(row, i){
                                                return (
                                                    <tr key={i} className={i < 2 ? "block": ""}>
                                                        {
                                                            _.map(row, function(cell, j){
                                                                return (
                                                                    <td key={j}
                                                                    className={cell.type == 'ghost' ? cell.color+' ghost' : cell.color}
                                                                    data={JSON.stringify({x:i, y:j, type: cell.type})}
                                                                    >
                                                                    </td>
                                                                )
                                                            }, this)
                                                        }
                                                    </tr>
                                                )
                                        }, this)
                                    }
                                </tbody>
                            </table>
                        </td>
                        <td>
                            <table>
                                <tbody>
                                    <tr>
                                        <td>
                                            <table className={this.state.pause ? "tetristable showPiecesTable1 pause" : "tetristable showPiecesTable1"}>
                                                <tbody>
                                                    {
                                                        _.map(_.range(5), function(row, i){
                                                            var state = this;
                                                            var tetrimino = state.queue[0];
                                                            var tetriminoColor = tetrimino.color;
                                                            var tetriminoShape = tetrimino.getShape();
                                                            return (
                                                                <tr key={i}>
                                                                    {
                                                                        _.map(_.range(5), function(cell, j){
                                                                            var color = "empty";
                                                                            if(i > 0 && j > 0){
                                                                                if(i - 1 < tetriminoShape.length){
                                                                                    if(j - 1 < tetriminoShape[i-1].length && tetriminoShape[i-1][j-1]){
                                                                                        color = tetriminoColor;
                                                                                    }
                                                                                }
                                                                            }
                                                                            return (
                                                                                <td key={j} className={color}>
                                                                                </td>
                                                                            )
                                                                        })
                                                                    }
                                                                </tr>
                                                            )
                                                        }, this.state)
                                                    }
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table className={this.state.pause ? "tetristable showPiecesTable1 pause" : "tetristable showPiecesTable1"}>
                                                <tbody>
                                                    {
                                                        _.map(_.range(5), function(row, i){
                                                            var state = this;
                                                            var tetrimino = state.queue[1];
                                                            var tetriminoColor = tetrimino.color;
                                                            var tetriminoShape = tetrimino.getShape();
                                                            return (
                                                                <tr key={i}>
                                                                    {
                                                                        _.map(_.range(5), function(cell, j){
                                                                            var color = "empty";
                                                                            if(i > 0 && j > 0){
                                                                                if(i - 1 < tetriminoShape.length){
                                                                                    if(j - 1 < tetriminoShape[i-1].length && tetriminoShape[i-1][j-1]){
                                                                                        color = tetriminoColor;
                                                                                    }
                                                                                }
                                                                            }
                                                                            return (
                                                                                <td key={j} className={color}>
                                                                                </td>
                                                                            )
                                                                        })
                                                                    }
                                                                </tr>
                                                            )
                                                        }, this.state)
                                                    }
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table className={this.state.pause ? "tetristable showPiecesTable1 pause" : "tetristable showPiecesTable1"}>
                                                <tbody>
                                                    {
                                                        _.map(_.range(5), function(row, i){
                                                            var state = this;
                                                            var tetrimino = state.queue[2];
                                                            var tetriminoColor = tetrimino.color;
                                                            var tetriminoShape = tetrimino.getShape();
                                                            return (
                                                                <tr key={i}>
                                                                    {
                                                                        _.map(_.range(5), function(cell, j){
                                                                            var color = "empty";
                                                                            if(i > 0 && j > 0){
                                                                                if(i - 1 < tetriminoShape.length){
                                                                                    if(j - 1 < tetriminoShape[i-1].length && tetriminoShape[i-1][j-1]){
                                                                                        color = tetriminoColor;
                                                                                    }
                                                                                }
                                                                            }
                                                                            return (
                                                                                <td key={j} className={color}>
                                                                                </td>
                                                                            )
                                                                        })
                                                                    }
                                                                </tr>
                                                            )
                                                        }, this.state)
                                                    }
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </td>
                        <td>
                            <h3>
                            <span class="spanPause" onClick={this.pause}>{this.state.pause ? "Unpause" : "Pause"}</span><br/>
                            <span>Ghost? <input class="inputGhost" type="checkbox" onClick={this.ghost}/></span><br/>
                            You have {this.state.points} points.<br/>
                            Level: {this.state.level}<br/>
                            { this.state.gameover ?(<span onClick={this.reset}>Game Over! Restart?</span>):""}
                            { !!this.state.levelSign ?(<span>LEVEL UP!</span>):""}
                            </h3>
                        </td>
                    </tr>
                 </tbody>
            </table>
        </div>
    );
  }
});

// TODO: Inicializar o componente deveria estar no html?
ReactDOM.render(
    <GridTable />,
    document.getElementById('grid')
);

