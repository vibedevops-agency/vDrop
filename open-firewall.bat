@echo off
netsh advfirewall firewall delete rule name="vDrop 1947" >nul 2>&1
netsh advfirewall firewall delete rule name="YDroply 1947" >nul 2>&1
netsh advfirewall firewall delete rule name="LanDrop 1947" >nul 2>&1
netsh advfirewall firewall delete rule name="LanDrop 1857" >nul 2>&1
netsh advfirewall firewall delete rule name="LanDrop Node" >nul 2>&1
netsh advfirewall firewall add rule name="vDrop 1947" dir=in action=allow protocol=TCP localport=1947 profile=any enable=yes
netsh advfirewall firewall add rule name="vDrop Node" dir=in action=allow program="%LocalAppData%\Programs\node\node.exe" profile=any enable=yes
echo Firewall rules for vDrop port 1947 are ready.
pause
