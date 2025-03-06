//Undo/Redo stack for the terminal history
const STACK_SIZE = 4;
export class UndoRedoStack{
    stack: (string | null)[] = [];
    index: number = -1;
    undoCount = -1;
    redoCount = 0;
    constructor(){
        for (let i = 0; i < STACK_SIZE; i++){
            this.stack.push(null);
        }
    }

    public push(state: string){
        this.index = (this.index + 1) % STACK_SIZE;
        this.stack[this.index] = state;
        this.undoCount ++;
        this.redoCount = 0;
    }

    public undo(): string | null{
        if (this.undoCount === 0){
            return null;
        }
        this.index = (this.index - 1 + STACK_SIZE) % STACK_SIZE;
        this.undoCount --;
        this.redoCount ++;
        return this.stack[this.index];
    }
    public redo(): string | null{
        if (this.redoCount === 0){
            return null;
        }
        this.index = (this.index + 1) % STACK_SIZE;
        this.undoCount ++;
        this.redoCount --;
        return this.stack[this.index];
    }
}