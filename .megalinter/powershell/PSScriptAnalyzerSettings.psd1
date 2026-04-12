@{
    Rules = @{
        # On garde les règles “dangereuses” / qualité réelle
        PSAvoidUsingEmptyCatchBlock                 = $true
        PSUseDeclaredVarsMoreThanAssignments        = $true

        # On calme le bruit pour tes scripts d'orchestration
        PSAvoidUsingWriteHost                       = $false
        PSUseShouldProcessForStateChangingFunctions = $false
    }
}
