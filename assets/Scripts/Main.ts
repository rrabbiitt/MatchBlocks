import { _decorator, Component, Node, Prefab, instantiate, Vec2, Vec3, tween, Input, EventTouch, UITransform, Animation, Sprite } from 'cc';
import { UIManager } from './UIManager';
import { GameManager } from './GameManager'
const { ccclass, property } = _decorator;

@ccclass('Main')
export class Main extends Component {

    @property([Prefab]) blockPrefabs: Prefab[] = [];

    @property(Prefab) Line_XPrefab: Prefab = null!;
    @property(Prefab) Line_YPrefab: Prefab = null!;
    @property(Prefab) RainbowPrefab: Prefab = null!;

    @property(Node) boardNode: Node = null!;
    @property(UIManager) uiManager: UIManager = null!;
    @property(GameManager) gameManager: GameManager = null!;
    @property moveCount: number = 30;

    private readonly width = 8;
    private readonly height = 8; // 8*8 보드
    private readonly spacing = 60; // 블럭 간 간격 (픽셀)

    public isGameOver: boolean = false;
    private isInitialDropComplete = false;

    private blockCount = 0;
    private boardArray: Node[][] = [];
    private specialBlocks: { x: number; y: number; type: 'Y' | 'X' | 'Rainbow' }[] = [];

    private selectedBlock: Node | null = null;
    private selectedPos: [number, number] | null = null;

    start() {
        this.uiManager.initUI(this.moveCount); // 시작하면서 UI 초기화
        this.adjustBoardSize();
        this.spawnInitialBlocks();

        this.scheduleOnce(() => {
            GameManager.Instance.setBoardArray(this.boardArray);
        }, 1); // 모든 블럭이 생성되고 나서 boardArray를 안전하게 GameManager에 전달

        this.boardNode.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.boardNode.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    private adjustBoardSize() { // 블럭 수와 간격에 따라 boardNode의 UI 크기를 설정
        const widthPx = this.width * this.spacing;
        const heightPx = this.height * this.spacing;
        const uiTransform = this.boardNode.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(widthPx, heightPx);
        }
    }

    private spawnInitialBlocks() {
        for (let x = 0; x < this.width; x++) { // 가로로 탐색
            for (let y = 0; y < this.height; y++) { // 세로로 탐색
                this.spawnBlockWithDrop(x, y, true, true); // 초기 생성용이여서 isInitial = true
            }
        }
    }

    private spawnBlockWithDrop(x: number, y: number, isFromTop: boolean = true, isInitial: boolean = false) {
        // 보드노드의 정중앙에 맞추기 위한 오프셋 설정
        const offsetX = -((this.width - 1) * this.spacing) / 2;
        const offsetY = -((this.height - 1) * this.spacing) / 2;
        const posX = offsetX + x * this.spacing;
        const posY = offsetY + y * this.spacing;

        // 블럭이 떨어지는 y 좌표 설정
        const startY = isFromTop ? this.height * this.spacing + 200 : posY;
        const startPos = new Vec3(posX, startY, 0);
        const targetPos = new Vec3(posX, posY, 0);

        let block: Node;

        if (isInitial) { // 게임이 시작할 때 초기 블럭 생성
            if (y <= 3) { // y=0~3인 경우 Rock 블럭을 배치
                block = instantiate(GameManager.Instance.getRockPrefab());
                block.name = "Rock";
                GameManager.Instance.registerRockBlock();
            } else {
                block = this.getNonMatchingBlock(x, y);
            }
        } else {
            block = this.getRandomBlock();
        }

        block.setPosition(startPos);
        this.boardNode.addChild(block);

        if (!this.boardArray[x]) this.boardArray[x] = [];
        this.boardArray[x][y] = block;

        if (isFromTop) this.blockCount++;

        tween(block)
            .to(0.3, { position: targetPos }, { easing: 'bounceOut' }) // targetPos로 이동, 'bouncOut' -> 부드럽게 튀는 효과
            .call(() => {
                if (this.blockCount >= this.width * this.height && !this.isInitialDropComplete) {
                    this.isInitialDropComplete = true;
                    this.scheduleOnce(() => this.checkAndDestroyMatches(), 0.2);
                }
            })
            .start();
    }

    private getRandomBlock(): Node { // 랜덤 색깔 블럭 생성
        const index = Math.floor(Math.random() * this.blockPrefabs.length);
        const prefab = this.blockPrefabs[index];
        const block = instantiate(prefab);
        block.name = prefab.name;
        return block;
    }

    private getNonMatchingBlock(x: number, y: number): Node { // 초기 생성할때만 적용, 3개 이상 연속 블럭 없이 생성되도록 함
        let maxTry = 10;

        while (maxTry-- > 0) {
            const block = this.getRandomBlock();
            const name = block.name;

            const left1 = this.boardArray[x - 1]?.[y];
            const left2 = this.boardArray[x - 2]?.[y];
            const down1 = this.boardArray[x]?.[y - 1];
            const down2 = this.boardArray[x]?.[y - 2];

            const horizontal = left1 && left2 && left1.name === name && left2.name === name;
            const vertical = down1 && down2 && down1.name === name && down2.name === name;

            if (!horizontal && !vertical) return block;
        }

        return this.getRandomBlock();
    }

    onTouchStart(event: EventTouch) { // 터치 입력 시작
        if (this.moveCount <= 0) return;
        const touchPos2D = event.getUILocation();
        const touchPos = new Vec3(touchPos2D.x, touchPos2D.y, 0);
        const local = this.boardNode.getComponent(UITransform)!.convertToNodeSpaceAR(touchPos);
        const [x, y] = this.getGridPosFromLocal(local);
        if (this.isValidPos(x, y)) {
            this.selectedBlock = this.boardArray[x][y];
            this.selectedPos = [x, y];
        }
    }

    onTouchEnd(event: EventTouch) { // 블럭 터치 후 스와이프 방향을 확인해 인접한 블럭과 교체 시도
        if (!this.selectedBlock || !this.selectedPos || this.moveCount <= 0) return;

        const touchPos2D = event.getUILocation();
        const touchPos = new Vec3(touchPos2D.x, touchPos2D.y, 0);
        const local = this.boardNode.getComponent(UITransform)!.convertToNodeSpaceAR(touchPos);
        const [endX, endY] = this.getGridPosFromLocal(local);

        const [startX, startY] = this.selectedPos;
        const dx = Math.abs(endX - startX);
        const dy = Math.abs(endY - startY);

        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            this.trySwap(startX, startY, endX, endY);
        }

        this.selectedBlock = null;
        this.selectedPos = null;
    }

    private getGridPosFromLocal(pos: Vec3): [number, number] { // 좌표를 보드 상의 그리드 인덱스 (x, y)로 변환
        const offsetX = -((this.width - 1) * this.spacing) / 2;
        const offsetY = -((this.height - 1) * this.spacing) / 2;
        const x = Math.floor((pos.x - offsetX + this.spacing / 2) / this.spacing);
        const y = Math.floor((pos.y - offsetY + this.spacing / 2) / this.spacing);
        return [x, y];
    }

    private isValidPos(x: number, y: number): boolean { // 좌표가 보드 범위 내에 있는지 확인
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    private trySwap(x1: number, y1: number, x2: number, y2: number) { // 두 블록의 위치를 바꾸고, 특수 블록 효과 및 매칭 여부 확인
        if (this.isGameOver) return;

        const b1 = this.boardArray[x1][y1];
        const b2 = this.boardArray[x2][y2];

        if (!b1 || !b2 || !b1.isValid || !b2.isValid || b1.name === "Rock" || b2.name === "Rock") return;

        const tempPos1 = b1.position.clone();
        const tempPos2 = b2.position.clone();

        this.boardArray[x1][y1] = b2;
        this.boardArray[x2][y2] = b1;

        tween(b1).to(0.2, { position: tempPos2 }, { easing: 'quadOut' }).start(); // b1 블록을 b2 위치로 부드럽게 이동, quadOut->자연스러운 감속 효과
        tween(b2).to(0.2, { position: tempPos1 }, { easing: 'quadOut' }).call(() => {
            const isLineX = b1.name === 'Line_X' || b2.name === 'Line_X';
            const isLineY = b1.name === 'Line_Y' || b2.name === 'Line_Y';

            if (isLineX || isLineY) {
                this.moveCount--;
                this.uiManager.updateMoveCount(this.moveCount);
                const targetX = b1.name.startsWith('Line') ? x2 : x1;
                const targetY = b1.name.startsWith('Line') ? y2 : y1;

                if (isLineX) this.triggerLineClear(targetX, targetY, 'Line_X');
                if (isLineY) this.triggerLineClear(targetX, targetY, 'Line_Y');
                this.checkGameOver();
                return;
            }

            const matchedNow = this.checkMatchAt(x1, y1) || this.checkMatchAt(x2, y2);
            if (!matchedNow) {
                this.boardArray[x1][y1] = b1;
                this.boardArray[x2][y2] = b2;
                tween(b1).to(0.2, { position: tempPos1 }, { easing: 'quadOut' }).start();
                tween(b2).to(0.2, { position: tempPos2 }, { easing: 'quadOut' }).start();
            } else {
                this.moveCount--;
                this.uiManager.updateMoveCount(this.moveCount);
                this.checkAndDestroyMatches();
                this.checkGameOver();
            }
        }).start();


        const isRainbow = b1.name === 'Rainbow' || b2.name === 'Rainbow';

        if (isRainbow) { // 레인보우 블럭 이벤트 처리
            const rainbowBlock = b1.name === 'Rainbow' ? b1 : b2;
            const targetBlock = b1.name === 'Rainbow' ? b2 : b1;
            const targetName = targetBlock.name;

            this.moveCount--;
            this.uiManager.updateMoveCount(this.moveCount);

            tween(b1).to(0.2, { position: tempPos2 }, { easing: 'quadOut' }).start();
            tween(b2).to(0.2, { position: tempPos1 }, { easing: 'quadOut' })
                .call(() => {
                    this.destroyAllBlocksByName(targetName, rainbowBlock);
                })
                .start();

            return;
        }
    }

    private checkGameOver() {
        if (this.moveCount <= 0) {
            this.boardNode.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
            this.boardNode.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
            this.uiManager.showGameOver();
        }
    }

    private destroyAllBlocksByName(name: string, extraBlock?: Node) { // 레인보우 블록과 스와핑한 색깔 블록 전부 파괴
        const blocksToDestroy: [number, number][] = [];

        for (let x = 0; x < this.width; x++) { // 전체 보드 탐색에서 같은 이름 확인 및 저장
            for (let y = 0; y < this.height; y++) {
                const block = this.boardArray[x][y];
                if (block && block.name === name) {
                    blocksToDestroy.push([x, y]);
                }
            }
        }

        let destroyCount = 0;
        const totalToDestroy = blocksToDestroy.length;

        for (const [x, y] of blocksToDestroy) {
            const block = this.boardArray[x][y];
            if (!block) continue;

            this.spawnBlockFragments(block.position, this.blockPrefabs.find(p => p.name === block.name) ?? this.blockPrefabs[0]);
            block.destroy();
            this.boardArray[x][y] = null!;
            destroyCount++;

            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // 주변 Rock 블록 확인하고 파괴
                const nx = x + dx, ny = y + dy;
                const neighbor = this.isValidPos(nx, ny) ? this.boardArray[nx][ny] : null;
                if (neighbor?.name === "Rock") GameManager.Instance.destroyRock(nx, ny);
            }

            if (destroyCount === totalToDestroy) { // 모든 블록 파괴가 완료되면 레인보우도 제거하고 보드를 리필
                if (extraBlock?.isValid) {
                    this.spawnBlockFragments(
                        extraBlock.position,
                        this.blockPrefabs.find(p => p.name === extraBlock.name) ?? this.blockPrefabs[0]
                    );
                    extraBlock.destroy();
                    this.scheduleOnce(() => this.collapseAndRefill(), 0.1);
                } else {
                    this.scheduleOnce(() => this.collapseAndRefill(), 0.1);
                }
            }
        }
    }

    triggerLineClear(x: number, y: number, type: 'Line_X' | 'Line_Y') {
        let positions: { dx: number; dy: number }[] = [];

        if (type === 'Line_Y') {
            for (let dx = 0; dx < this.width; dx++) positions.push({ dx, dy: y });
        } else {
            for (let dy = 0; dy < this.height; dy++) positions.push({ dx: x, dy });
        }

        let clearPromises: Promise<void>[] = [];

        for (const { dx, dy } of positions) {
            const block = this.boardArray[dx][dy];
            if (!block || !block.isValid) continue;

            const name = block.name;

            this.spawnBlockFragments(block.position, this.blockPrefabs.find(p => p.name === name) ?? this.blockPrefabs[0]);

            const p = new Promise<void>(resolve => {
                tween(block)
                    .delay(0.2)
                    .call(() => {
                        block.destroy();
                        this.boardArray[dx][dy] = null!;

                        if (name === "Rock") {
                            console.log("확인!!")
                            GameManager.Instance.destroyRock(dx, dy);
                        }

                        if (name === 'Line_X' || name === 'Line_Y') this.triggerLineClear(dx, dy, name as 'Line_X' | 'Line_Y');
                        else if (name === 'Rainbow') {
                            const color = this.getNearbyColor(dx, dy);
                            if (color) this.destroyAllBlocksByName(color);
                        }

                        resolve();
                    })
                    .start();
            });

            clearPromises.push(p);
        }

        Promise.all(clearPromises).then(() => {
            this.scheduleOnce(() => {
                this.specialBlocks.forEach(({ x, y, type }) => this.spawnSpecialBlock(x, y, type));
                this.specialBlocks = [];

                this.collapseAndRefill();
                this.scheduleOnce(() => this.checkAndDestroyMatches(), 0.3);
            }, 0.2);
        });
    }

    private checkMatchAt(x: number, y: number): boolean { // 3개 이상 같은 블록 확인
        const name = this.boardArray[x][y].name;

        let count = 1;
        for (let dx = x - 1; dx >= 0 && this.boardArray[dx][y]?.name === name; dx--) count++;
        for (let dx = x + 1; dx < this.width && this.boardArray[dx][y]?.name === name; dx++) count++;
        if (count >= 3) return true;

        count = 1;
        for (let dy = y - 1; dy >= 0 && this.boardArray[x][dy]?.name === name; dy--) count++;
        for (let dy = y + 1; dy < this.height && this.boardArray[x][dy]?.name === name; dy++) count++;
        if (count >= 3) return true;
    }

    public spawnBlockFragments(pos: Vec3, prefab: Prefab): void { // 파괴할때 쪼개지는 애니메이션 (파편 이미지 없어서 그냥 기존 이미지 사용)
        const directions = [
            new Vec3(-30, 30, 0),
            new Vec3(30, 30, 0),
            new Vec3(-30, -30, 0),
            new Vec3(30, -30, 0),
        ];

        for (let i = 0; i < 4; i++) {
            const fragment = instantiate(prefab);
            fragment.setScale(new Vec3(0.4, 0.4, 1));
            fragment.setPosition(pos);
            this.boardNode.addChild(fragment);

            tween(fragment).to(0.5, {
                position: pos.clone().add(directions[i]),
                scale: new Vec3(0, 0, 1),
                angle: 180,
            }, { easing: 'quadOut' })
                .call(() => fragment.destroy())
                .start();
        }
    }

    private checkAndDestroyMatches() { // 매칭된 블럭 찾기
        const matched: boolean[][] = Array.from({ length: this.width }, () => Array(this.height).fill(false)); // 매칭된 블록 위치 저장할 배열
        const specialBlocks: { x: number; y: number; type: 'Y' | 'X' | 'Rainbow' }[] = []; // 특수 블록 저장할 배열

        const scan = (horizontal: boolean) => { // 가로 세로 탐색
            const row = horizontal ? this.height : this.width;
            const column = horizontal ? this.width : this.height;
            for (let o = 0; o < row; o++) { // o는 고정된 행
                let i = 0;
                while (i < column - 2) {
                    const x = horizontal ? i : o;
                    const y = horizontal ? o : i;
                    const b1 = this.boardArray[x][y];
                    if (!b1 || b1.name === "Rock") {
                        i++; continue;
                    }
                    const name = b1.name;
                    let matchCount = 1;
                    for (let j = i + 1; j < column; j++) { // 같은 이름 몇개인지 확인
                        const nx = horizontal ? j : o;
                        const ny = horizontal ? o : j;
                        const b = this.boardArray[nx][ny];
                        if (b && b.name === name) matchCount++;
                        else break;
                    }
                    if (matchCount >= 3) { // 매치되는 블록 matched 배열에 표시
                        for (let j = 0; j < matchCount; j++) {
                            const nx = horizontal ? i + j : o;
                            const ny = horizontal ? o : i + j;
                            matched[nx][ny] = true;
                        }
                        const center = Math.floor(matchCount / 2); // 매치되는 블록에 따라 특수 블록 확인
                        const sx = horizontal ? i + (matchCount === 4 ? 1 : center) : o;
                        const sy = horizontal ? o : i + (matchCount === 4 ? 1 : center);
                        if (matchCount === 4) specialBlocks.push({ x: sx, y: sy, type: horizontal ? 'Y' : 'X' });
                        else if (matchCount >= 5) specialBlocks.push({ x: sx, y: sy, type: 'Rainbow' });
                    }
                    i += matchCount;
                }
            }
        }

        scan(true); // 가로 확인
        scan(false); // 세로 확인

        const blocksToDestroy: [number, number][] = [];
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                if (matched[x][y]) blocksToDestroy.push([x, y]); // matched가 true인 위치 전부 배열에 저장
            }
        }
        if (blocksToDestroy.length === 0) return;

        let destroyCount = 0;
        for (const [x, y] of blocksToDestroy) {
            const block = this.boardArray[x][y];
            const name = block.name;
            this.spawnBlockFragments(block.position, this.blockPrefabs.find(p => p.name === name) ?? this.blockPrefabs[0]);

            tween(block).to(0.2, { scale: new Vec3(0, 0, 0) }).call(() => {
                block.destroy();
                this.boardArray[x][y] = null!;
                destroyCount++;
                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                    const nx = x + dx, ny = y + dy;
                    if (this.isValidPos(nx, ny) && this.boardArray[nx][ny]?.name === "Rock")
                        GameManager.Instance.destroyRock(nx, ny);
                });
                if (name === 'Line_X' || name === 'Line_Y') this.triggerLineClear(x, y, name);
                else if (name === 'Rainbow') {
                    const color = this.getNearbyColor(x, y);
                    if (color) this.destroyAllBlocksByName(color);
                }
                if (destroyCount === blocksToDestroy.length) {
                    specialBlocks.forEach(({ x, y, type }) => this.spawnSpecialBlock(x, y, type));
                    this.scheduleOnce(() => this.collapseAndRefill(), 0.1);
                }
            }).start();
        }
    }

    private getNearbyColor(x: number, y: number): string | null { // 레인보우가 스와핑해서 파괴된게 아니라 다른거로 인해 파괴될 때
        const directions = [
            [1, 0], [-1, 0], [0, 1], [0, -1]
        ];

        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;

            if (this.isValidPos(nx, ny)) { // 보드 안쪽 좌표여야함
                const neighbor = this.boardArray[nx][ny];
                if (neighbor && !neighbor.name.startsWith("Line") && neighbor.name !== "Rainbow") {
                    return neighbor.name;
                }
            }
        }
        return null; // 근처에 색깔 블록 없으면 null
    }

    private spawnSpecialBlock(x: number, y: number, type: 'Y' | 'X' | 'Rainbow') { // 특수 블록 생성
        let prefab: Prefab;

        if (type === 'Y') prefab = this.Line_YPrefab;
        else if (type === 'X') prefab = this.Line_XPrefab;
        else prefab = this.RainbowPrefab;

        if (!prefab) return;

        const special = instantiate(prefab);
        const offsetX = -((this.width - 1) * this.spacing) / 2;
        const offsetY = -((this.height - 1) * this.spacing) / 2;
        special.setPosition(new Vec3(offsetX + x * this.spacing, offsetY + y * this.spacing, 0));
        special.name = type === 'X' ? 'Line_Y' : type === 'Y' ? 'Line_X' : 'Rainbow';
        this.boardNode.addChild(special);
        this.boardArray[x][y] = special;

        const anim = special.getComponent(Animation);
        if (anim) {
            anim.play(); // 디폴트 클립 재생
        }
    }

    private collapseAndRefill() {
        for (let x = 0; x < this.width; x++) {
            let emptyY = 0; // 세로 비어있는 블록 개수
            for (let y = 0; y < this.height; y++) {
                const block = this.boardArray[x][y];

                if (!block || !block.isValid) {
                    this.boardArray[x][y] = null!;
                    emptyY++;
                } else if (emptyY > 0) {
                    const offsetY = -((this.height - 1) * this.spacing) / 2;
                    const targetY = offsetY + (y - emptyY) * this.spacing;

                    tween(block)
                        .to(0.3, { position: new Vec3(block.position.x, targetY, 0) }, { easing: 'bounceOut' })
                        .start();

                    this.boardArray[x][y - emptyY] = block;
                    this.boardArray[x][y] = null!;
                }
            }

            // 위에서 떨어지면 맨 위에서부터 빈 공간만큼 새로운 블록 생성
            for (let i = 0; i < emptyY; i++) {
                this.spawnBlockWithDrop(x, this.height - emptyY + i);
            }
        }
        this.scheduleOnce(() => { // 다 리필되면 매칭 또 확인
            this.checkAndDestroyMatches();
        }, 0.5);
    }
}