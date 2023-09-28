local Main = {}

function Main.error(input)
  -- print(input)
  print("ERROR")
end

function Main.success(input)
  -- printTable(input)
  print("Success")
end

function Main.printTable(table, indent)
  indent = indent or 0

  for k, v in pairs(table) do
    if type(v) == "table" then
      print(string.rep("  ", indent) .. k .. " = {")
      printTable(v, indent + 1)
      print(string.rep("  ", indent) .. "}")
    else
      print(string.rep("  ", indent) .. k .. " = " .. tostring(v))
    end
  end
end

return Main
