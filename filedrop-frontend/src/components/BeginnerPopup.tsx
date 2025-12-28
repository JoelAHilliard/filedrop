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
          <div class="w-[75%] mx-auto mt-10">
            <Carousel>
                <CarouselContent>
                    <CarouselItem className="text-xs flex items-center justify-center text-center font-bold">1. Upload any file under 50mb.</CarouselItem>
                    <CarouselItem className="text-xs flex items-center justify-center text-center">2. Save your retrieval code (we cant get it back for you).</CarouselItem>
                    <CarouselItem className="text-xs flex items-center justify-center text-center">3. Retrieve it in under two hours.</CarouselItem>
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
            <Label className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="showagain">Don't show again</Label>
          </div>
        </DialogContent>
      </Dialog>
      
    )
}