import { _decorator, Component, Node, Label, Prefab, instantiate, Vec3, tween } from 'cc';
import { Main } from './Main';
import { UIManager } from './UIManager';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Prefab)
    rockPrefab: Prefab = null!;

    @property(Label)
    rockLabel: Label = null!;

    @property(UIManager)
    uiManager: UIManager = null!;

    @property(Node)
    boardNode: Node = null!;

    @property(Main)
    mainScript: Main = null!;


    public static Instance: GameManager;

    private rockCount = 0;

    onLoad() {
        GameManager.Instance = this;
    }

    public getRockPrefab(): Prefab {
        return this.rockPrefab;
    }

    public registerRockBlock(): void {
        this.rockCount++;
        this.updateLabel();
    }

    private boardArray: Node[][] = [];

    public setBoardArray(boardArray: Node[][]): void {
        this.boardArray = boardArray;
    }

    public destroyRock(x: number, y: number, force: boolean = false): void {
        const rock = this.boardArray[x]?.[y];

        if ((rock && rock.name === "Rock") || force) {
            const pos = rock?.getPosition?.() ?? null;

            if (rock) rock.destroy();
            this.boardArray[x][y] = null!;
            this.rockCount--;
            this.updateLabel();

            if (pos && this.mainScript) {
                this.mainScript.spawnBlockFragments(pos, this.rockPrefab);
            }

            if (this.rockCount <= 0) {
                this.endGame();
            }
        }
    }

    private updateLabel(): void {
        if (this.rockLabel) {
            this.rockLabel.string = `${this.rockCount}`;
        }
    }

    private endGame(): void {
        if (this.uiManager) {
            this.uiManager.showGameClear();
        }
    }
}
