import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const [activeTab, setActiveTab] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const list = listRef.current
    if (!list) return

    const observer = new MutationObserver(() => {
      const activeTrigger = list.querySelector('[data-state="active"]')
      if (activeTrigger) {
        const triggers = Array.from(list.querySelectorAll('[role="tab"]'))
        const activeIndex = triggers.indexOf(activeTrigger)
        setActiveTab(activeIndex)
      }
    })

    observer.observe(list, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-state']
    })

    // Initial check
    const activeTrigger = list.querySelector('[data-state="active"]')
    if (activeTrigger) {
      const triggers = Array.from(list.querySelectorAll('[role="tab"]'))
      const activeIndex = triggers.indexOf(activeTrigger)
      setActiveTab(activeIndex)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <TabsPrimitive.List
      ref={(node) => {
        listRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground relative",
        className
      )}
      {...props}
    >
      <div 
        className="absolute top-1 bottom-1 w-[calc(50%-8px)] bg-background rounded-sm shadow-sm transition-all duration-300 ease-out z-[1]"
        style={{
          left: activeTab === 0 ? '4px' : 'calc(50% + 4px)'
        }}
      />
      {props.children}
    </TabsPrimitive.List>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground relative z-10 flex-1",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
