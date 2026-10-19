import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
  } from "@/components/ui/dialog"
import { useEffect, useState } from "preact/hooks"
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
  } from "@/components/ui/carousel"
  import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "./ui/label"


export const BeginnerPopup = () => {

    const [showAgain,setShowAgain] = useState(false);
    useEffect(()=>{
        if(localStorage.getItem("popupShown") != 'true'){
            document.getElementById("trigger").click();
        }
        
    },[])
    const handleChange = (e) => {
        setShowAgain(e);
        if(e){
            localStorage.setItem("popupShown",JSON.stringify(true))
        } else {
            localStorage.removeItem("popupShown")
        }
    }
    
    return (
      <Dialog>
        <DialogTrigger id="trigger" class="hidden">Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Welcome to Filedrop.</DialogTitle>
            <DialogDescription className="text-sm">
                The best solution for swift and uncomplicated file sharing between computers. Not for long-term storage.
            </DialogDescription>
          </DialogHeader>
          <div class="w-full sm:w-[75%] mx-auto mt-6 sm:mt-10 px-10 sm:px-0">
            <Carousel>
                <CarouselContent>
                    <CarouselItem className="text-sm sm:text-xs flex items-center justify-center text-center font-bold min-h-[3rem]">1. Upload any file under 500MB.</CarouselItem>
                    <CarouselItem className="text-sm sm:text-xs flex items-center justify-center text-center min-h-[3rem]">2. Save your retrieval code (we can't get it back for you).</CarouselItem>
                    <CarouselItem className="text-sm sm:text-xs flex items-center justify-center text-center min-h-[3rem]">3. Retrieve it before it expires (up to 3 days).</CarouselItem>
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
            </Carousel>
          </div>
          <div className="flex items-center space-x-2 mt-4">
            <Checkbox
                id="showagain"
                checked={showAgain}
                onCheckedChange={handleChange}
            />
            <Label className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer py-2" htmlFor="showagain">Don't show again</Label>
          </div>
        </DialogContent>
      </Dialog>
      
    )
}