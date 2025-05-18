import { _decorator, Component, Node, Label } from 'cc';
import { Main } from './Main';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {

    @property(Label)
    moveLabel: Label = null!;

    @property(Node)
    gameOverNode: Node = null!;

    @property(Node)
    gameClearNode: Node = null;

    @property(Main)
    mainScript: Main = null!;


    initUI(initialMoveCount: number) {
        this.updateMoveCount(initialMoveCount);
        if (this.gameOverNode) {
            this.gameOverNode.active = false;
        }
    }

    updateMoveCount(count: number) {
        if (this.moveLabel) {
            this.moveLabel.string = `${count}`;
        }
    }

    showGameOver() {
        this.gameOverNode.active = true;
        this.mainScript.isGameOver = true;
    }

    showGameClear() {
        this.gameClearNode.active = true;
        this.mainScript.isGameOver = true;
    }
}
